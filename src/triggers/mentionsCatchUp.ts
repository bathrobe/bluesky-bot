// The start-up scan for @s the in-memory queue lost. Catch-up normally comes from the saved cursor
// (bluesky/poll.ts replays every missed event, oldest first). But the cursor is saved once an @ is
// QUEUED, not once it is answered, so a restart while an @ was waiting or failing would forget it.
// main.ts runs this once per start: every unanswered @ in the recent history (last 100 messages,
// 7 days) of each @-reply conversation, oldest first. Read-only; the queue and the already-answered
// check before each run keep it from answering anything twice.
// Item 26 (lost state) can call this too, after it has rebuilt the rest of the state.
import { fetchRecentMessages } from "../bluesky/history.ts";
import { config } from "../config.ts";
import type { QueuedMention } from "../runs/runQueuePick.ts";
import { findUnansweredMentions } from "./mentions.ts";

export type CatchUpScanOptions = {
  session: any; // from createSession()
  skippedMentionIds: string[]; // state.skippedMentionIds
  atReplyConvoIds?: string[];
  allowedConvoIds?: string[];
  fetchRecent?: (session: any, convoId: string) => Promise<any[]>; // tests inject a fake
};

export async function findMentionsLeftUnanswered(options: CatchUpScanOptions): Promise<QueuedMention[]> {
  const { session, skippedMentionIds, fetchRecent = fetchRecentMessages } = options;
  const atReplyConvoIds = options.atReplyConvoIds ?? config.atReplyConvoIds;
  const allowedConvoIds = options.allowedConvoIds ?? config.allowedConvoIds;
  const leftUnanswered: QueuedMention[] = [];
  // Only conversations that are both @-reply conversations and on the allow list are ever read.
  for (const convoId of atReplyConvoIds.filter((atReplyConvoId) => allowedConvoIds.includes(atReplyConvoId))) {
    const recentMessages = await fetchRecent(session, convoId);
    leftUnanswered.push(...findUnansweredMentions(recentMessages, convoId, session.homerDid, skippedMentionIds, atReplyConvoIds));
  }
  return leftUnanswered.sort((first, second) => Date.parse(first.sentAt) - Date.parse(second.sentAt));
}
