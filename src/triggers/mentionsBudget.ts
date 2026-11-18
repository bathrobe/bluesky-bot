// The @ budget (spec.md > @-reply > Budget). Pure: state in, new state out.
// Per conversation: 4 answered @s in any 15 minutes; the next @ gets one brush-off run (the notes
// tell the model to keep it to a line); after that, @s inside the window are skipped with no model call.
//
// Bookkeeping: state.atReplyTimesByConvo[convoId] holds the ISO time of every @-reply run that POSTED,
// full answer or brush-off alike. The decision counts the times inside the last 15 minutes:
//   fewer than 4 -> "answer"     exactly 4 -> "brush-off"     5 or more -> "skip"
// Because the brush-off is recorded like an answer, it is what moves the count from 4 to 5, so there is
// one brush-off and then silence. Answering resumes as old times slide out of the window.
// NOT counted: a deliberate model skip (empty plan), a budget skip, and a failed run. Those posted nothing.
import { config } from "../config.ts";
import type { HomerState } from "../state.ts";

export type AtReplyBudgetDecision = "answer" | "brush-off" | "skip";
export type AtReplyBudgetCaps = { atRepliesPerWindow: number; atReplyWindowMinutes: number };
type BudgetState = Pick<HomerState, "atReplyTimesByConvo">;
type SkippedState = Pick<HomerState, "skippedMentionIds">;

// The times still inside the window: (now - 15 min, now]. A time exactly 15 minutes old is out.
export function atReplyTimesInWindow(answeredTimes: string[], nowMs: number, windowMinutes = config.caps.atReplyWindowMinutes): string[] {
  const windowMs = windowMinutes * 60_000;
  return answeredTimes.filter((answeredTime) => nowMs - Date.parse(answeredTime) < windowMs);
}

// `answeredTimes` is one conversation's list: state.atReplyTimesByConvo[convoId] ?? [].
export function decideAtReplyBudget(answeredTimes: string[], nowMs: number, caps: AtReplyBudgetCaps = config.caps): AtReplyBudgetDecision {
  const answeredInWindow = atReplyTimesInWindow(answeredTimes, nowMs, caps.atReplyWindowMinutes).length;
  if (answeredInWindow < caps.atRepliesPerWindow) return "answer";
  if (answeredInWindow === caps.atRepliesPerWindow) return "brush-off";
  return "skip";
}

// Drop times that have left the window, and conversations with none left, so state.json stays small.
export function pruneAtReplyTimes(
  atReplyTimesByConvo: Record<string, string[]>,
  nowMs: number,
  windowMinutes = config.caps.atReplyWindowMinutes,
): Record<string, string[]> {
  const prunedEntries = Object.entries(atReplyTimesByConvo ?? {})
    .map(([convoId, answeredTimes]) => [convoId, atReplyTimesInWindow(answeredTimes, nowMs, windowMinutes)] as const)
    .filter(([, answeredTimes]) => answeredTimes.length > 0);
  return Object.fromEntries(prunedEntries);
}

// Call after an @-reply run posted, whether it was a full answer or the brush-off. Prunes as it goes.
export function recordAnsweredMention<State extends BudgetState>(
  state: State,
  convoId: string,
  now: Date,
  windowMinutes = config.caps.atReplyWindowMinutes,
): State {
  const prunedTimes = pruneAtReplyTimes(state.atReplyTimesByConvo, now.getTime(), windowMinutes);
  const convoTimes = [...(prunedTimes[convoId] ?? []), now.toISOString()];
  return { ...state, atReplyTimesByConvo: { ...prunedTimes, [convoId]: convoTimes } };
}

// Call when an @ is deliberately not answered: the model's empty plan, or a budget "skip".
// The ID is never pruned: it is what stops a restart or a replayed event from answering it late.
export function recordSkippedMention<State extends SkippedState>(state: State, mentionMessageId: string): State {
  const skippedMentionIds = state.skippedMentionIds ?? [];
  if (skippedMentionIds.includes(mentionMessageId)) return state;
  return { ...state, skippedMentionIds: [...skippedMentionIds, mentionMessageId] };
}
