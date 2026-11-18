// The @-reply run (spec.md > @-reply, > Message lifecycle). The run queue calls this with one queued @.
// Before the model is called, on every try:
//   1. fresh history from now back to the @ -> already answered, skipped, or deleted? drop it silently
//   2. the @ budget -> "skip" records the ID in skippedMentionIds with no model call
// Then the shared pipeline, in the conversation the @ came from, with the meme catalog and the lookups.
// After a finished run, recordAtReplyOutcome writes an answered time or the skipped ID (atReplyCheck.ts).
// A failed run writes nothing: runs/atReplyRetry.ts queues it again.
import { config } from "../config.ts";
import { createLookupTools } from "../tools/lookupTools.ts";
import { recordSkippedMention } from "../triggers/mentionsBudget.ts";
import { checkMentionBeforeRun, recordAtReplyOutcome } from "./atReplyCheck.ts";
import { buildAtReplyNotes } from "./atReplyNotes.ts";
import { allowedRunConvoId, defaultRunDependencies } from "./runDependencies.ts";
import type { QueuedMention } from "./runQueuePick.ts";
import { runShared, type RunResult, type RunSharedOptions } from "./runShared.ts";

export type RunAtReplyOptions = {
  dryRun: boolean; // dry: the model is called, nothing is sent and no state is written
  dependencies?: RunSharedOptions["dependencies"]; // tests inject fakes
  nowMs?: () => number;
};

// "dropped": already answered / skipped / deleted, no model call. "budget-skipped": over the @ budget,
// no model call, ID recorded. The rest are the shared pipeline's outcomes.
export type AtReplyResult = Omit<RunResult, "outcome"> & {
  outcome: RunResult["outcome"] | "dropped" | "budget-skipped";
  mentionMessageId: string;
  detail: string | null; // why it was dropped, or "brush-off"
};

export async function runAtReply(mention: QueuedMention, options: RunAtReplyOptions): Promise<AtReplyResult> {
  const dependencies = { ...defaultRunDependencies, ...options.dependencies };
  const convoId = allowedRunConvoId(mention.convoId); // throws unless on the allow list
  const noRun = { mentionMessageId: mention.messageId, convoId, plan: null, error: null, logPath: null, detail: null };
  if ((await dependencies.readState()).paused) return { ...noRun, outcome: "paused" };

  const session = await dependencies.createSession();
  const history = await dependencies.fetchMessagesBackTo(session, convoId, Date.parse(mention.sentAt));
  const check = checkMentionBeforeRun({
    mention,
    messagesSinceMention: history.messages,
    state: await dependencies.readState(), // read after the fetch, so it is as fresh as the history
    homerDid: session.homerDid,
    nowMs: (options.nowMs ?? Date.now)(),
  });
  if (check.decision === "drop") return { ...noRun, outcome: "dropped", detail: check.why };
  if (check.decision === "budget-skip") {
    if (!options.dryRun) {
      await dependencies.updateState((state) => void Object.assign(state, recordSkippedMention(state, mention.messageId)));
    }
    return { ...noRun, outcome: "budget-skipped", detail: "over the @ budget for this conversation" };
  }

  const result = await runShared({
    runKind: "at-reply",
    skillFile: "at-reply.md",
    includeMemeCatalog: true,
    buildLookupTools: createLookupTools, // search_chat, search_bluesky, bluesky_user_posts, read_link; 4 calls per run shared
    dryRun: options.dryRun,
    convoId,
    mentioningMessageId: mention.messageId,
    dependencies: { ...options.dependencies, createSession: async () => session }, // one login per run
    buildRunNotes: (context) =>
      buildAtReplyNotes({
        ...context,
        mentionMessage: check.mentionMessage,
        budgetDecision: check.budgetDecision,
        timeZone: config.schedule.timeZone,
      }),
    // Live, finished runs only (runShared skips this in dry mode and on failure).
    recordFinishedRun: (state, finishedAtIso, finished) => recordAtReplyOutcome(state, mention, finished.sent, finishedAtIso),
  });
  return { ...result, mentionMessageId: mention.messageId, detail: check.budgetDecision === "brush-off" ? "brush-off" : null };
}
