// How search_chat's result reads to the model. Pure: matches + what was searched in, text out.
// One line per match, oldest first, ending in the {id} the model can reply or react to.
import { describeEmbed, flattenText } from "../transcriptParts.ts";

export const MATCHES_SHOWN_AT_EACH_END = 10; // more than 2× this many matches → oldest 10 + newest 10

export type SearchScope = {
  keywords: string[];
  before?: string;
  messagesSearched: number;
  oldestSearchedSentAt?: string; // the oldest message the search looked at
  reachedStartOfChat: boolean; // false → stopped at the page cap
  maxPages: number;
};

export function formatDate(sentAt: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(sentAt)).toLowerCase();
}

// What a message says, as matched and as shown: its text plus any shared post (meme alt text etc.).
export function searchableText(message: any): string {
  return [flattenText(message.text), describeEmbed(message.embed)].filter(Boolean).join(" ");
}

export function formatMatchLine(message: any, nameForDid: (did: string) => string, timeZone: string): string {
  const parentName = message.replyTo?.sender?.did ? ` ↳ ${nameForDid(message.replyTo.sender.did)}` : "";
  const body = searchableText(message) || "(empty)";
  return `[${formatDate(message.sentAt, timeZone)}] ${nameForDid(message.sender?.did)}${parentName}: ${body}   {${message.id}}`;
}

function describeScope(scope: SearchScope, timeZone: string): string {
  const olderThan = scope.before ? ` older than {${scope.before}}` : "";
  const backTo = scope.oldestSearchedSentAt ? `, back to ${formatDate(scope.oldestSearchedSentAt, timeZone)}` : "";
  const stoppedAt = scope.reachedStartOfChat
    ? " (the start of the chat record)"
    : ` (stopped at the ${scope.maxPages}-page limit; older messages exist but were not searched)`;
  return `searched ${scope.messagesSearched} messages${olderThan}${backTo}${stoppedAt}.`;
}

// `matchesOldestFirst` are the full matches; this decides how many to show.
export function formatSearchChatResult(
  matchesOldestFirst: any[],
  scope: SearchScope,
  nameForDid: (did: string) => string,
  timeZone: string,
): { resultText: string; shownMessages: any[] } {
  const keywordList = scope.keywords.map((keyword) => `"${keyword}"`).join(", ");
  const scopeLine = describeScope(scope, timeZone);
  if (matchesOldestFirst.length === 0) {
    return { resultText: `no matches for ${keywordList}. ${scopeLine}`, shownMessages: [] };
  }
  const line = (message: any) => formatMatchLine(message, nameForDid, timeZone);
  const total = matchesOldestFirst.length;
  const header = `${total} ${total === 1 ? "match" : "matches"} for ${keywordList}, oldest first. ${scopeLine}`;
  if (total <= MATCHES_SHOWN_AT_EACH_END * 2) {
    return { resultText: [header, ...matchesOldestFirst.map(line)].join("\n"), shownMessages: matchesOldestFirst };
  }
  const oldest = matchesOldestFirst.slice(0, MATCHES_SHOWN_AT_EACH_END);
  const newest = matchesOldestFirst.slice(-MATCHES_SHOWN_AT_EACH_END);
  const skipped = total - oldest.length - newest.length;
  const gapLine = `… ${skipped} more matches in between, not shown. narrow the keywords, or pass before: an {id} to search older than it …`;
  const resultText = [header, ...oldest.map(line), gapLine, ...newest.map(line)].join("\n");
  return { resultText, shownMessages: [...oldest, ...newest] };
}
