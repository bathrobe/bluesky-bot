// Read-only chat history: recent messages for the transcript, a page-back for search_chat,
// and the members' handles. Callers pass a convoId they already checked against the allow list.
import { config } from "../config.ts";
import { withSessionRetry, type Session } from "./session.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAGE_SIZE = 100; // getMessages' own limit

// One page of getMessages, newest first. Pass the returned nextCursor to go further back.
// nextCursor is undefined when there is nothing older.
export async function fetchMessagePage(
  session: Session,
  convoId: string,
  cursor?: string,
  pageSize = MAX_PAGE_SIZE,
): Promise<{ messages: any[]; nextCursor?: string }> {
  const response: any = await withSessionRetry(session, () =>
    session.chatAgent.chat.bsky.convo.getMessages({ convoId, limit: pageSize, cursor }),
  );
  return { messages: response.data.messages, nextCursor: response.data.cursor };
}

export function isOlderThan(message: any, cutoffMs: number): boolean {
  return Date.parse(message.sentAt) < cutoffMs;
}

// The last `maxMessages` messages, none older than `maxAgeDays`, oldest first.
// Deleted messages are kept here (the transcript decides how to show them).
export async function fetchRecentMessages(
  session: Session,
  convoId: string,
  options: { maxMessages?: number; maxAgeDays?: number; nowMs?: number } = {},
): Promise<any[]> {
  const maxMessages = options.maxMessages ?? config.caps.historyMessages;
  const maxAgeDays = options.maxAgeDays ?? config.caps.historyMaxAgeDays;
  const cutoffMs = (options.nowMs ?? Date.now()) - maxAgeDays * DAY_MS;

  const newestFirst: any[] = [];
  let cursor: string | undefined;
  do {
    const pageSize = Math.min(MAX_PAGE_SIZE, maxMessages - newestFirst.length);
    const page = await fetchMessagePage(session, convoId, cursor, pageSize);
    const recentOnPage = page.messages.filter((message) => !isOlderThan(message, cutoffMs));
    newestFirst.push(...recentOnPage);
    const reachedCutoff = recentOnPage.length < page.messages.length;
    cursor = reachedCutoff ? undefined : page.nextCursor;
  } while (cursor && newestFirst.length < maxMessages);

  return newestFirst.slice(0, maxMessages).reverse();
}

// Every message from now back to `sinceMs` (an @'s send time), oldest first: what the already-answered
// check reads, however old the @ is. reachedStart is false when the page cap ran out before that time.
export async function fetchMessagesBackTo(
  session: Session,
  convoId: string,
  sinceMs: number,
  maxPages = config.caps.searchChatPagesPerCall,
): Promise<{ messages: any[]; reachedStart: boolean }> {
  const newestFirst: any[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await fetchMessagePage(session, convoId, cursor);
    newestFirst.push(...page.messages);
    const reachedStart = !page.nextCursor || page.messages.some((message) => isOlderThan(message, sinceMs));
    if (reachedStart) return { messages: newestFirst.reverse(), reachedStart: true };
    cursor = page.nextCursor;
  }
  return { messages: newestFirst.reverse(), reachedStart: false };
}

// "joetforhire.com" → "joetforhire", "someone.bsky.social" → "someone". Homer is always "homer".
export function shortenHandle(handle: string): string {
  return handle.replace(/\.bsky\.social$/, "").split(".")[0];
}

// Map every member's DID to a short handle. getConvoMembers is metadata only (no message text).
// Not getConvo: in a group it returns only a handful of members (5 of 45, checked 2026-11-17).
export async function fetchShortHandleByDid(
  session: Session,
  convoId: string,
  maxPages = 10,
): Promise<Record<string, string>> {
  const shortHandleByDid: Record<string, string> = {};
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const response: any = await withSessionRetry(session, () =>
      session.chatAgent.chat.bsky.convo.getConvoMembers({ convoId, limit: 100, ...(cursor ? { cursor } : {}) }),
    );
    for (const member of response.data.members) {
      shortHandleByDid[member.did] = member.did === session.homerDid ? "homer" : shortenHandle(member.handle);
    }
    cursor = response.data.cursor;
    if (!cursor) break;
  }
  return shortHandleByDid;
}
