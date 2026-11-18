// The @-reply trigger and the already-answered check (spec.md > @-reply). Pure: no network, no state file.
// A real mention is a facet feature `app.bsky.richtext.facet#mention` holding Homer's DID
// (spike-notes.md > Item 4 findings). His bare name as plain text is the heartbeat's business, not ours.
// The @ budget lives next door in mentionsBudget.ts.
import type { NewMessageEvent } from "../bluesky/poll.ts";
import { config } from "../config.ts";
import type { QueuedMention } from "../runs/runQueuePick.ts";

const MENTION_FEATURE_TYPE = "app.bsky.richtext.facet#mention";
const DELETED_MESSAGE_TYPE = "chat.bsky.convo.defs#deletedMessageView";

// True when the message carries a real mention of `did`.
export function hasMentionFacetFor(message: any, did: string): boolean {
  return (message?.facets ?? []).some((facet: any) =>
    (facet.features ?? []).some((feature: any) => feature.$type === MENTION_FEATURE_TYPE && feature.did === did),
  );
}

// The trigger: a message from someone else, in a conversation where @-replies are on, that mentions Homer.
// A deleted message never triggers (nothing left to answer).
export function isMentionOfHomer(
  message: any,
  convoId: string,
  homerDid: string,
  atReplyConvoIds: string[] = config.atReplyConvoIds,
): boolean {
  if (!atReplyConvoIds.includes(convoId)) return false;
  if (!message?.id || message.$type === DELETED_MESSAGE_TYPE) return false;
  if (message.sender?.did === homerDid) return false; // Homer never summons himself
  return hasMentionFacetFor(message, homerDid);
}

// What the run queue holds for one @: the queue needs messageId + sentAt; the run needs convoId.
export function toQueuedMention(message: any, convoId: string): QueuedMention {
  return { messageId: message.id, sentAt: message.sentAt, convoId, senderDid: message.sender?.did };
}

// For handleNewMessage (item 25): the mention to enqueue, or null when this event is not an @ of Homer.
export function readMentionTrigger(
  event: NewMessageEvent,
  homerDid: string,
  atReplyConvoIds: string[] = config.atReplyConvoIds,
): QueuedMention | null {
  if (!isMentionOfHomer(event.message, event.convoId, homerDid, atReplyConvoIds)) return null;
  return toQueuedMention(event.message, event.convoId);
}

// True when some Homer message in `convoMessages` is a reply to the mention. A deleted Homer reply
// has no replyTo any more, so it does not count: the @ is open again.
export function hasHomerReplyTo(mentionMessageId: string, convoMessages: any[], homerDid: string): boolean {
  return convoMessages.some((message) => message.sender?.did === homerDid && message.replyTo?.id === mentionMessageId);
}

// Already answered = Homer replied to it, or it was deliberately skipped. Either one drops the @.
// Checked right before a run (item 25) against freshly fetched messages and state.skippedMentionIds.
export function isMentionAnswered(
  mentionMessageId: string,
  convoMessages: any[],
  homerDid: string,
  skippedMentionIds: string[] = [],
): boolean {
  return skippedMentionIds.includes(mentionMessageId) || hasHomerReplyTo(mentionMessageId, convoMessages, homerDid);
}

// Every @ of Homer in `convoMessages` that still needs an answer, oldest first. Item 26 runs this
// over the last 100 messages after lost state; catch-up can use it too.
export function findUnansweredMentions(
  convoMessages: any[],
  convoId: string,
  homerDid: string,
  skippedMentionIds: string[] = [],
  atReplyConvoIds: string[] = config.atReplyConvoIds,
): QueuedMention[] {
  return convoMessages
    .filter((message) => isMentionOfHomer(message, convoId, homerDid, atReplyConvoIds))
    .filter((message) => !isMentionAnswered(message.id, convoMessages, homerDid, skippedMentionIds))
    .map((message) => toQueuedMention(message, convoId))
    .sort((first, second) => Date.parse(first.sentAt) - Date.parse(second.sentAt));
}
