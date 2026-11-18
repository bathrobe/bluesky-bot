// The @-reply's two pure decisions (spec.md > @-reply, > Message lifecycle):
//   before the run: drop it (already answered, skipped, gone), skip it (over budget), or run it
//   after the run:  what a finished run writes to state.json
// No network, no state file: runs/atReply.ts feeds these fresh history and state.
import type { SentRecord } from "../plan/executePlan.ts";
import type { HomerState } from "../state.ts";
import { isMentionAnswered, isMentionOfHomer } from "../triggers/mentions.ts";
import { decideAtReplyBudget, recordAnsweredMention, recordSkippedMention } from "../triggers/mentionsBudget.ts";
import type { QueuedMention } from "./runQueuePick.ts";

export type MentionCheck =
  | { decision: "drop"; why: string } // silently: no model call, nothing written
  | { decision: "budget-skip" } // no model call; the caller records the ID as skipped
  | { decision: "run"; mentionMessage: any; budgetDecision: "answer" | "brush-off" };

export type MentionCheckInput = {
  mention: QueuedMention;
  messagesSinceMention: any[]; // fresh getMessages items from now back to the mention, oldest first
  state: Pick<HomerState, "skippedMentionIds" | "atReplyTimesByConvo">;
  homerDid: string;
  nowMs: number;
  atReplyConvoIds?: string[]; // default config.atReplyConvoIds
};

// Runs right before every @-reply run, first try or retry, so no @ is ever answered twice.
export function checkMentionBeforeRun(input: MentionCheckInput): MentionCheck {
  const { mention, messagesSinceMention, state, homerDid, nowMs } = input;
  if (isMentionAnswered(mention.messageId, messagesSinceMention, homerDid, state.skippedMentionIds)) {
    return { decision: "drop", why: "already answered or deliberately skipped" };
  }
  // The message as it is now. Deleted, no longer a mention, or too far back to find: nothing to answer,
  // and without the full history since it we could not prove it is unanswered.
  const mentionMessage = messagesSinceMention.find((message) => message.id === mention.messageId);
  if (!mentionMessage || !isMentionOfHomer(mentionMessage, mention.convoId, homerDid, input.atReplyConvoIds)) {
    return { decision: "drop", why: "the mentioning message is deleted or could not be found in the history" };
  }
  const answeredTimes = state.atReplyTimesByConvo?.[mention.convoId] ?? [];
  const budgetDecision = decideAtReplyBudget(answeredTimes, nowMs);
  if (budgetDecision === "skip") return { decision: "budget-skip" };
  return { decision: "run", mentionMessage, budgetDecision };
}

// True when a text or meme that quote-replies the mention actually landed.
export function didReplyLand(mentionMessageId: string, sentRecords: SentRecord[]): boolean {
  return sentRecords.some(
    (record) => record.messageId && !record.error && record.action.type !== "react" && record.action.type !== "playlist_add" && record.action.replyTo === mentionMessageId,
  );
}

// For a finished live run (posted or skipped; never a failed one). Mutates `state` inside updateState.
//   a reply to the @ landed  -> an answered time, which counts toward the budget (brush-off included)
//   anything else            -> the ID goes to skippedMentionIds and nothing counts toward the budget:
//     an empty plan (the model's deliberate skip), or reactions only. A reaction has no replyTo, so the
//     already-answered check cannot see it; recording the ID is what stops a restart answering it again.
export function recordAtReplyOutcome(state: HomerState, mention: QueuedMention, sentRecords: SentRecord[], finishedAtIso: string): void {
  const nextState = didReplyLand(mention.messageId, sentRecords)
    ? recordAnsweredMention(state, mention.convoId, new Date(finishedAtIso))
    : recordSkippedMention(state, mention.messageId);
  Object.assign(state, nextState);
}
