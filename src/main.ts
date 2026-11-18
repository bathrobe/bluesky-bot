// Homer's long-running process (`pnpm start`). Two independent timers, both forever:
//   every 30s: poll the chat (off switch, then mentions -> the run queue)
//   every 60s: ask the scheduler what is due and hand it to the run queue
// Before either timer starts, startUp.ts logs in, rebuilds a missing state.json from the chat
// (recovery.ts), and scans the recent history once for unanswered @s (triggers/mentionsCatchUp.ts).
// Missed @s after that: the saved cursor replays every missed event oldest first.
// Neither timer awaits a run. The queue runs one run at a time in the background, and a run only
// awaits the network, so polling (and `off`) keeps working while a heartbeat is in progress.
import { config } from "./config.ts";
import type { Session } from "./bluesky/session.ts";
import { createFetchLogPage, pollNewMessages } from "./bluesky/poll.ts";
import { handleNewMessage } from "./handleNewMessage.ts";
import { loadLaunchRecordIntoConfig } from "./launch/launchRecord.ts";
import { runPollLoop, sleepSeconds } from "./pollLoop.ts";
import { sendOperatorAlert } from "./bluesky/send.ts";
import { runAtReply } from "./runs/atReply.ts";
import { createAtReplyRunReporter } from "./runs/atReplyRetry.ts";
import { runHeartbeat } from "./runs/heartbeat.ts";
import { runMorningGm } from "./runs/morningGm.ts";
import { runWelcome } from "./runs/welcome.ts";
import { targetConvoId } from "./runs/runDependencies.ts";
import { createRunQueue, type FinishedRun, type QueuedMention } from "./runs/runQueue.ts";
import { checkScheduleOnce, createScheduledRunReporter, runScheduleLoop } from "./scheduleLoop.ts";
import { startUp, startUpUntilDone } from "./startUp.ts";
import { readState, updateState } from "./state.ts";

let session: Session | null = null;
let joeDid: string | null = null; // the off switch only listens to Joe

// Three failed scheduled attempts alert Joe in the test DM, through the poll loop's session.
async function sendAlert(text: string) {
  if (!session) throw new Error("not logged in yet, so the operator alert was not sent");
  return sendOperatorAlert({ session }, text);
}

// Scheduled runs count failures per window; a failed @-reply is queued again (runs/atReplyRetry.ts).
const enqueueMention = (mention: QueuedMention): boolean => runQueue.enqueueMention(mention);
const reportScheduledRun = createScheduledRunReporter({ sendAlert });
const reportAtReplyRun = createAtReplyRunReporter({ enqueueMention, sendAlert });

// A join waits a couple of minutes, so a batch of joins gets one welcome. The run itself works out who
// is new (runs/welcome.ts), so an extra request, or one for someone already welcomed, sends nothing.
const WELCOME_DELAY_MS = 2 * 60 * 1000;
function requestWelcomeSoon() {
  setTimeout(() => void runQueue.requestScheduledRun("welcome"), WELCOME_DELAY_MS);
}

const runQueue = createRunQueue({
  runFunctions: {
    heartbeat: () => runHeartbeat({ dryRun: false }),
    gm: () => runMorningGm({ dryRun: false }),
    welcome: () => runWelcome({ dryRun: false }),
    atReply: (mention) => runAtReply(mention, { dryRun: false }),
  },
  isPaused: async () => (await readState()).paused,
  onRunFinished: (finishedRun: FinishedRun) => (finishedRun.kind === "atReply" ? reportAtReplyRun(finishedRun) : reportScheduledRun(finishedRun)),
});

// One poll: read new events, hand each on, then save the cursor.
// The cursor is saved only after the whole batch is handled (its @s queued), so a crash replays, never skips.
async function pollOnce(): Promise<void> {
  if (!session || !joeDid) throw new Error("start-up has not finished");
  const loggedInSession = session;
  const handleContext = { homerDid: loggedInSession.homerDid, joeDid, sendContext: { session: loggedInSession }, enqueueMention };
  const savedCursor = (await readState()).pollCursor;
  const { events, joins, cursor } = await pollNewMessages({
    fetchLogPage: createFetchLogPage(loggedInSession),
    cursor: savedCursor,
    allowedConvoIds: config.allowedConvoIds,
  });
  if (!savedCursor) console.log(`no saved cursor; starting from now (${cursor})`);
  for (const event of events) {
    await handleNewMessage(event, handleContext);
  }
  // Joins in the conversation Homer runs in. Only the DID is printed, never a name or text.
  const targetJoins = joins.filter((join) => join.convoId === targetConvoId());
  for (const join of targetJoins) console.log(`join in ${join.convoId}: ${join.memberDid}; welcome in ${WELCOME_DELAY_MS / 60000} min`);
  if (targetJoins.length > 0) requestWelcomeSoon();
  // updateState re-reads state.json, so writes from a `pnpm tick` in between are kept.
  if (cursor && cursor !== savedCursor) await updateState((state) => (state.pollCursor = cursor));
  void runQueue.pump(); // e.g. Joe just sent `on` and @s are waiting
}

const { pollSeconds, scheduleCheckSeconds } = config.schedule;
// DM only unless state.json holds the launch record; read once here, so a launch needs a restart.
const launchSettings = await loadLaunchRecordIntoConfig();
console.log(`target ${launchSettings.target}; allow list ${launchSettings.allowedConvoIds.join(", ")}`);
console.log(`homer starting; polling every ${pollSeconds}s, checking the schedule every ${scheduleCheckSeconds}s`);
// Login, lost-state recovery and the start scan finish before anything can poll, run or send.
({ session, joeDid } = await startUpUntilDone(() => startUp({ enqueueMention }), sleepSeconds));
void runScheduleLoop({ checkOnce: () => checkScheduleOnce({ queue: runQueue }), checkSeconds: scheduleCheckSeconds, sleep: sleepSeconds });
await runPollLoop({ pollOnce, pollSeconds: config.schedule.pollSeconds, sleep: sleepSeconds });
