// What main.ts does once, before the poll and schedule loops start: log in, learn Joe's DID, rebuild
// state.json if it is missing (recovery.ts), then queue the @s nobody answered (the start scan, which
// covers the "scan the last 100 messages" half of a lost cursor). Nothing here sends anything.
import { fetchRecentMessages } from "./bluesky/history.ts";
import { createSession, type Session } from "./bluesky/session.ts";
import { config, readJoeDidFromTestDm } from "./config.ts";
import { backoffSecondsAfterFailures, describeError } from "./pollLoop.ts";
import { recoverLostState, type RecoveredState } from "./recovery.ts";
import type { QueuedMention } from "./runs/runQueue.ts";
import { targetConvoId } from "./runs/runDependencies.ts";
import { createDefaultState, defaultStatePath, readState, stateFileExists, writeState } from "./state.ts";
import { findMentionsLeftUnanswered } from "./triggers/mentionsCatchUp.ts";

type FetchRecent = (session: any, convoId: string) => Promise<any[]>;

export type RecoverOptions = {
  session: any; // needs homerDid; the fetch uses the rest
  joeDid: string;
  statePath?: string; // tests use a temp file
  fetchRecent?: FetchRecent; // default: the last 100 messages, 7 days
  convoIds?: { target: string; testDm: string }; // default: config (both checked against the allow list)
  logLine?: (line: string) => void;
};

// Returns the recovered fields, or null when state.json exists (then nothing is read or written).
export async function recoverStateIfLost(options: RecoverOptions): Promise<RecoveredState | null> {
  const { session, joeDid, statePath = defaultStatePath, fetchRecent = fetchRecentMessages, logLine = console.log } = options;
  if (await stateFileExists(statePath)) return null;
  const convoIds = options.convoIds ?? { target: targetConvoId(), testDm: config.testDmConvoId };
  const targetConvoMessages = await fetchRecent(session, convoIds.target);
  const testDmMessages = convoIds.testDm === convoIds.target ? targetConvoMessages : await fetchRecent(session, convoIds.testDm);
  const recovered = recoverLostState({ targetConvoMessages, testDmMessages, homerDid: session.homerDid, joeDid, testDmConvoId: convoIds.testDm });
  await writeState({ ...createDefaultState(), ...recovered }, statePath);
  logLine(`no state.json: rebuilt it from the chat (paused: ${recovered.paused}, lastHeartbeatAt: ${recovered.lastHeartbeatAt ?? "none"})`);
  logLine("meme usage starts empty; rebuild it with: pnpm tsx --env-file=.env scripts/rebuildMemeUsage.ts");
  return recovered;
}

export type StartUpOptions = {
  enqueueMention: (mention: QueuedMention) => boolean;
  login?: () => Promise<Session>;
  readJoeDid?: (session: Session) => Promise<string>;
  statePath?: string;
  fetchRecent?: FetchRecent;
  convoIds?: { target: string; testDm: string };
  logLine?: (line: string) => void;
};

export async function startUp(options: StartUpOptions): Promise<{ session: Session; joeDid: string }> {
  const { enqueueMention, statePath = defaultStatePath, logLine = console.log } = options;
  const session = await (options.login ?? createSession)();
  const joeDid = await (options.readJoeDid ?? ((newSession) => readJoeDidFromTestDm(newSession.chatAgent, newSession.homerDid)))(session);
  await recoverStateIfLost({ session, joeDid, statePath, fetchRecent: options.fetchRecent, convoIds: options.convoIds, logLine });
  const { skippedMentionIds } = await readState(statePath);
  const leftUnanswered = await findMentionsLeftUnanswered({ session, skippedMentionIds, fetchRecent: options.fetchRecent });
  const queuedCount = leftUnanswered.filter(enqueueMention).length;
  logLine(`start scan: ${queuedCount} unanswered @(s) in the recent history queued, oldest first`);
  logLine(`logged in as ${session.homerHandle}; allowed conversations: ${config.allowedConvoIds.join(", ")}`);
  return { session, joeDid };
}

// Login can fail (network, 5xx): wait 30s, 60s, … up to 5 min and try again, like the poll loop.
export async function startUpUntilDone<Result>(startUpOnce: () => Promise<Result>, sleep: (seconds: number) => Promise<void>, logLine = console.log): Promise<Result> {
  for (let consecutiveFailures = 1; ; consecutiveFailures++) {
    try {
      return await startUpOnce();
    } catch (error) {
      const waitSeconds = backoffSecondsAfterFailures(consecutiveFailures);
      logLine(`start-up failed (${consecutiveFailures} in a row): ${describeError(error)}; retrying in ${waitSeconds}s`);
      await sleep(waitSeconds);
    }
  }
}
