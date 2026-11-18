// search_chat: keyword search back through the run's own conversation. Read-only.
// See spec.md > Lookup tools and prd.md > Callback. Pages getMessages newest first, 100 at a time,
// up to config.caps.searchChatPagesPerCall pages, and stops early on an empty page (the API hands
// back a next cursor even when nothing older exists).
import { fetchMessagePage } from "../bluesky/history.ts";
import { config } from "../config.ts";
import type { LookupTool } from "../llm/toolLoop.ts";
import { isDeleted } from "../transcriptParts.ts";
import { formatSearchChatResult, searchableText } from "./searchChatFormat.ts";

export const searchChatToolDefinition = {
  type: "function",
  function: {
    name: "search_chat",
    description:
      "keyword search back through this chat's whole history (it starts the day you joined; nothing earlier exists). " +
      "returns the messages that contain any of the keywords (case-insensitive), oldest first, one line each: " +
      "date, sender, text, and the message {id} — use that id to quote-reply or react. " +
      'if nothing matches it says "no matches" and how far back it looked. at most 20 matches are shown ' +
      "(the oldest 10 and the newest 10). `before` is optional: a message id; only messages older than it are searched.",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "words or short phrases; a message matches if it contains any of them" },
        before: { type: "string", description: "optional message id (from the transcript or a previous result): search only messages older than it" },
      },
      required: ["keywords"],
    },
  },
};

export type FetchPage = (cursor?: string) => Promise<{ messages: any[]; nextCursor?: string }>;

export type SearchChatToolOptions = {
  session?: any; // used by the default fetchPage
  convoId: string; // the run's target conversation; must be on the allow list
  shortHandleByDid: Record<string, string>;
  fetchPage?: FetchPage; // tests inject fake pages
  maxPages?: number;
  timeZone?: string;
  allowedConvoIds?: string[];
};

export function readKeywords(rawKeywords: unknown): string[] {
  const list = Array.isArray(rawKeywords) ? rawKeywords : typeof rawKeywords === "string" ? [rawKeywords] : [];
  return list.filter((keyword): keyword is string => typeof keyword === "string").map((keyword) => keyword.trim()).filter(Boolean);
}

// Every message on up to maxPages pages, newest first, and whether the start of the chat was reached.
export async function readHistoryPages(fetchPage: FetchPage, maxPages: number) {
  const newestFirst: any[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await fetchPage(cursor);
    if (page.messages.length === 0 || !page.nextCursor) {
      newestFirst.push(...page.messages);
      return { newestFirst, reachedStartOfChat: true };
    }
    newestFirst.push(...page.messages);
    cursor = page.nextCursor;
  }
  return { newestFirst, reachedStartOfChat: false };
}

export function createSearchChatTool(options: SearchChatToolOptions): LookupTool {
  const allowedConvoIds = options.allowedConvoIds ?? config.allowedConvoIds;
  if (!allowedConvoIds.includes(options.convoId)) throw new Error(`search_chat refuses conversation ${options.convoId}: not in config.allowedConvoIds`);
  const fetchPage: FetchPage = options.fetchPage ?? ((cursor) => fetchMessagePage(options.session, options.convoId, cursor));
  const maxPages = options.maxPages ?? config.caps.searchChatPagesPerCall;
  const timeZone = options.timeZone ?? config.schedule.timeZone;
  const nameForDid = (did: string) => options.shortHandleByDid[did] ?? "someone";

  async function run(parsedArguments: any) {
    const keywords = readKeywords(parsedArguments?.keywords);
    if (keywords.length === 0) throw new Error("keywords must be a list of at least one non-empty word");
    const before = typeof parsedArguments?.before === "string" && parsedArguments.before.trim() ? parsedArguments.before.trim() : undefined;
    const { newestFirst, reachedStartOfChat } = await readHistoryPages(fetchPage, maxPages);
    // Message ids are TIDs: they sort by time as plain strings, so "older than" is a string compare.
    const searched = newestFirst.filter((message) => !isDeleted(message) && (!before || message.id < before));
    const lowercaseKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const matchesOldestFirst = searched
      .filter((message) => lowercaseKeywords.some((keyword) => searchableText(message).toLowerCase().includes(keyword)))
      .reverse();
    const scope = { keywords, before, messagesSearched: searched.length, oldestSearchedSentAt: searched.at(-1)?.sentAt, reachedStartOfChat, maxPages };
    const { resultText, shownMessages } = formatSearchChatResult(matchesOldestFirst, scope, nameForDid, timeZone);
    return { resultText, messageIds: shownMessages.map((message) => message.id) };
  }
  return { definition: searchChatToolDefinition, run };
}
