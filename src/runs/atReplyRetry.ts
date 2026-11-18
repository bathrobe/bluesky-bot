// What happens after each @-reply run: the run queue's onRunFinished for kind "atReply".
// The queue removes an @ when it takes it and never retries, so this is what keeps a failed @ alive
// (prd.md > When behaviors collide: "No @ is ever dropped").
//   failed or threw -> wait (2 min, then 10), then back in the queue. Every try starts with the
//                      already-answered check on fresh history (runs/atReply.ts), so a retry cannot
//                      answer twice, even if the "failed" run did get a message out.
//   third failure   -> give up for this process and alert Joe (one operator alert a day). The ID is NOT
//                      put in skippedMentionIds, so the scan at the next start finds it again.
//   paused          -> the off switch landed between the queue taking it and the run: back in the
//                      queue at once, where it waits for `on`. Not counted as a failure.
//   anything else   -> done (posted, skipped, dropped, budget-skipped, dry).
// Failure counts are in memory only: a restart starts them again.
import { config } from "../config.ts";
import { describeError } from "../pollLoop.ts";
import type { FinishedRun, QueuedMention } from "./runQueuePick.ts";

export type AtReplyRunReporterOptions = {
  enqueueMention: (mention: QueuedMention) => boolean; // live: runQueue.enqueueMention
  sendAlert: (text: string) => Promise<unknown>; // live: sendOperatorAlert, test DM only, one per ET day
  callLater?: (waitMs: number, callback: () => void) => void; // default setTimeout; tests inject a fake
  retryWaitMinutes?: number[]; // default config.caps.atReplyRetryWaitMinutes; its length + 1 = tries
  logLine?: (line: string) => void;
};

export function createAtReplyRunReporter(options: AtReplyRunReporterOptions) {
  const { enqueueMention, sendAlert, logLine = console.log } = options;
  const callLater = options.callLater ?? ((waitMs, callback) => void setTimeout(callback, waitMs));
  const retryWaitMinutes = options.retryWaitMinutes ?? config.caps.atReplyRetryWaitMinutes;
  const failedTriesByMentionId = new Map<string, number>();

  return async function reportAtReplyRun(finishedRun: FinishedRun): Promise<void> {
    if (finishedRun.kind !== "atReply" || !finishedRun.mention) return;
    const mention = finishedRun.mention;
    const result = finishedRun.result as any;
    const outcome = finishedRun.error ? "threw" : (result?.outcome ?? "unknown");
    const extras = [result?.detail, result?.logPath, finishedRun.error ? describeError(finishedRun.error) : null].filter(Boolean);
    const label = `@-reply {${mention.messageId}}`;
    logLine(`${new Date().toISOString()} ${label} finished: ${outcome}${extras.length ? ` (${extras.join("; ")})` : ""}`);

    if (outcome === "paused") return void enqueueMention(mention);
    if (outcome !== "failed" && outcome !== "threw") return void failedTriesByMentionId.delete(mention.messageId);

    const failedTries = (failedTriesByMentionId.get(mention.messageId) ?? 0) + 1;
    const waitMinutes = retryWaitMinutes[failedTries - 1];
    if (waitMinutes === undefined) {
      failedTriesByMentionId.delete(mention.messageId);
      logLine(`${label}: failed ${failedTries} times; giving up until the next start (not marked skipped)`);
      await sendAlert(`homer: an @-reply failed ${failedTries} times in a row, so I stopped trying. it is not marked skipped: the next restart picks it up.`);
      return;
    }
    failedTriesByMentionId.set(mention.messageId, failedTries);
    logLine(`${label}: failed try ${failedTries}; queued again in ${waitMinutes} min`);
    callLater(waitMinutes * 60_000, () => void enqueueMention(mention));
  };
}
