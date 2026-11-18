// Execute a plan that passed the plan check: print it (dry) or send each action in order (live).
// Live sends go through `sendAction`, which runShared binds to the Sender (src/bluesky/send.ts).
// There is no sending code in this file. See spec.md > Run pipeline step 5 and spec.md > Sender.
import type { RunOutcome } from "../log.ts";
import type { PostAction, PostPlan } from "../tools/post.ts";

// messageId: the new message's id; for a `react` it is the target message's id (reactions have none).
export type SentRecord = { action: PostAction; messageId?: string; error?: string };

type SendActionResult = { sent: true; messageId: string } | { sent: false; reason: string };

export type ExecutePlanOptions = {
  dryRun: boolean;
  convoId: string;
  sendAction?: (action: PostAction) => Promise<SendActionResult>; // required for a live run
  printLine?: (line: string) => void; // default console.log
};

export function describeAction(action: PostAction): string {
  const replyPart = "replyTo" in action && action.replyTo ? ` (reply to {${action.replyTo}})` : "";
  if (action.type === "react") return `react ${action.emoji} on {${action.messageId}}`;
  if (action.type === "playlist_add") return `playlist_add the video in {${action.messageId}}`;
  if (action.type === "text") return `text${replyPart}: "${action.text}"`;
  const captionPart = action.caption ? ` caption: "${action.caption}"` : "";
  const onTheNosePart = action.onTheNose ? ` [on the nose: ${action.onTheNose.why}]` : "";
  return `meme ${action.file}${replyPart}${captionPart}${onTheNosePart}`;
}

// Returns one record per action that was tried, for the run log. A dry run sends nothing: [].
// Live: a send that errors (or is stopped by the off switch) is recorded, not retried, and every
// action after it is dropped.
export async function executePlan(plan: PostPlan, options: ExecutePlanOptions): Promise<SentRecord[]> {
  const printLine = options.printLine ?? console.log;
  const modeLabel = options.dryRun ? "dry run" : "live";
  if (plan.actions.length === 0) {
    printLine(`${modeLabel}: skip (no actions)`);
    return [];
  }
  if (options.dryRun) {
    printLine(`dry run: would send to ${options.convoId}, in order:`);
    plan.actions.forEach((action, index) => printLine(`  ${index + 1}. ${describeAction(action)}`));
    return [];
  }
  if (!options.sendAction) throw new Error("executePlan: a live run needs sendAction");

  const sentRecords: SentRecord[] = [];
  printLine(`live: sending to ${options.convoId}, in order:`);
  for (const [index, action] of plan.actions.entries()) {
    const label = `  ${index + 1}. ${describeAction(action)}`;
    let error: string | undefined;
    try {
      const result = await options.sendAction(action);
      if (result.sent) {
        sentRecords.push({ action, messageId: result.messageId });
        printLine(`${label} → sent {${result.messageId}}`);
        continue;
      }
      error = `not sent: ${result.reason}`;
    } catch (sendError: any) {
      error = sendError?.message ?? String(sendError);
    }
    sentRecords.push({ action, error });
    const droppedCount = plan.actions.length - index - 1;
    printLine(`${label} → FAILED (${error}); ${droppedCount} remaining action(s) dropped`);
    break;
  }
  return sentRecords;
}

// The outcome of a live run. Something landed → posted (even if a later send failed: a retry would
// repeat what landed). Empty plan → skipped, on purpose. Nothing landed → failed, safe to retry.
export function summarizeLiveRun(plan: PostPlan, sentRecords: SentRecord[]): { outcome: RunOutcome; error: string | null } {
  const failedRecord = sentRecords.find((record) => record.error);
  const error = failedRecord ? `send failed on "${describeAction(failedRecord.action)}": ${failedRecord.error}` : null;
  if (plan.actions.length === 0) return { outcome: "skipped", error: null };
  const landedCount = sentRecords.filter((record) => record.messageId && !record.error).length;
  return { outcome: landedCount > 0 ? "posted" : "failed", error };
}
