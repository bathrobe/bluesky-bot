// Listener: read chat.bsky.convo.getLog from the saved cursor and pass on new messages.
// getLog returns events for EVERY conversation Homer is in. Events from a conversation not on
// the allow list are dropped first, by convo ID alone, before anything reads them.
// Real behaviour (checked 2026-11-14): no cursor → { logs: [], cursor: <now> }; from a cursor →
// up to 100 events oldest first plus the next cursor; a page can hold fewer than 100 and still
// have more after it, so we keep paging until a page comes back empty.
import { withSessionRetry, type Session } from "./session.ts";

export const LOG_CREATE_MESSAGE_TYPE = "chat.bsky.convo.defs#logCreateMessage";
const MESSAGE_VIEW_TYPE = "chat.bsky.convo.defs#messageView";
const DEFAULT_MAX_PAGES_PER_POLL = 20; // a long gap catches up over several polls

const JOIN_LOG_TYPES = ["chat.bsky.convo.defs#logAddMember", "chat.bsky.convo.defs#logMemberJoin"];

export type JoinEvent = { convoId: string; memberDid: string | null };
export type NewMessageEvent = { convoId: string; rev: string; message: any; relatedProfiles: any[] };
export type FetchLogPage = (cursor: string | undefined) => Promise<{ logs: any[]; cursor?: string }>;

// Allow list first, then only real new messages (not deletions, reactions, reads, system events).
export function keepNewMessagesFromAllowedConvos(logs: any[], allowedConvoIds: string[]): NewMessageEvent[] {
  const fromAllowedConvos = logs.filter((log) => allowedConvoIds.includes(log?.convoId));
  return fromAllowedConvos
    .filter((log) => log.$type === LOG_CREATE_MESSAGE_TYPE && log.message?.$type === MESSAGE_VIEW_TYPE)
    .map((log) => ({
      convoId: log.convoId,
      rev: log.rev,
      message: log.message,
      relatedProfiles: log.relatedProfiles ?? [],
    }));
}

// Someone was added to, or joined, an allowed conversation. Only the convo and member DID go on.
export function keepJoinsFromAllowedConvos(logs: any[], allowedConvoIds: string[]): JoinEvent[] {
  return logs
    .filter((log) => allowedConvoIds.includes(log?.convoId) && JOIN_LOG_TYPES.includes(log.$type))
    .map((log) => ({ convoId: log.convoId, memberDid: log.message?.data?.member?.did ?? null }));
}

// One poll. With no saved cursor we only learn where "now" is and pass nothing on, so a
// first run never replays old events.
export async function pollNewMessages(options: {
  fetchLogPage: FetchLogPage;
  cursor: string | null;
  allowedConvoIds: string[];
  maxPages?: number;
}): Promise<{ events: NewMessageEvent[]; joins: JoinEvent[]; cursor: string | null }> {
  const { fetchLogPage, allowedConvoIds, maxPages = DEFAULT_MAX_PAGES_PER_POLL } = options;
  if (!options.cursor) {
    const nowPage = await fetchLogPage(undefined);
    return { events: [], joins: [], cursor: nowPage.cursor ?? null };
  }

  let cursor = options.cursor;
  const events: NewMessageEvent[] = [];
  const joins: JoinEvent[] = [];
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await fetchLogPage(cursor);
    events.push(...keepNewMessagesFromAllowedConvos(page.logs ?? [], allowedConvoIds));
    joins.push(...keepJoinsFromAllowedConvos(page.logs ?? [], allowedConvoIds));
    const nextCursor = page.cursor ?? cursor;
    const reachedNow = (page.logs ?? []).length === 0 || nextCursor === cursor;
    cursor = nextCursor;
    if (reachedNow) break;
  }
  return { events, joins, cursor };
}

// The real page fetcher: getLog through the chat proxy, logging in again once on expiry.
export function createFetchLogPage(session: Session): FetchLogPage {
  return async (cursor) => {
    const response: any = await withSessionRetry(session, () =>
      session.chatAgent.chat.bsky.convo.getLog(cursor ? { cursor } : {}),
    );
    return response.data;
  };
}
