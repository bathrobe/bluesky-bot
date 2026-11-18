// The chat as the model reads it: one line per message, oldest first.
//   [2h ago] joe ↳ homer: text (shared post …) [👍 homer]   {messageId}
// Reactions are folded onto their message. Deleted messages are left out (they vanish
// for Homer too); a reply to one shows "↳ deleted message". Ported from Signal Homer.
import {
  describeEmbed,
  describeReactions,
  flattenText,
  formatAge,
  formatNow,
  isDeleted,
  snippet,
} from "./transcriptParts.ts";
import { describeSystemMessage, isSystemMessage } from "./welcome/joins.ts";

export type BuildTranscriptOptions = {
  nowMs: number;
  shortHandleByDid: Record<string, string>; // Homer's DID maps to "homer"
  timeZone?: string; // America/New_York by default
  header?: boolean; // prepend the "now" + id legend line; default true
};

function describeReply(message: any, idsInTranscript: Set<string>, nameForDid: (did: string) => string): string {
  const parent = message.replyTo;
  if (!parent) return "";
  if (isDeleted(parent)) return " ↳ deleted message";
  const parentName = nameForDid(parent.sender?.did);
  // The parent's own line is already in view; otherwise quote a little of it.
  if (idsInTranscript.has(parent.id)) return ` ↳ ${parentName}`;
  const parentText = snippet(parent.text) || (parent.embed ? "shared post" : "");
  return ` ↳ ${parentName} ("${parentText}")`;
}

export function buildTranscriptLine(
  message: any,
  idsInTranscript: Set<string>,
  nameForDid: (did: string) => string,
  nowMs: number,
): string {
  const age = formatAge(Date.parse(message.sentAt), nowMs);
  if (isSystemMessage(message)) return `[${age}] ${describeSystemMessage(message, nameForDid)}   {${message.id}}`;
  const name = nameForDid(message.sender?.did);
  const reply = describeReply(message, idsInTranscript, nameForDid);
  const body = [flattenText(message.text), describeEmbed(message.embed)].filter(Boolean).join(" ") || "(empty)";
  const reactions = describeReactions(message.reactions, nameForDid);
  const reactionPart = reactions ? ` ${reactions}` : "";
  return `[${age}] ${name}${reply}: ${body}${reactionPart}   {${message.id}}`;
}

// `messages` are chat.bsky.convo getMessages items, oldest first (as fetchRecentMessages returns).
export function buildTranscript(messages: any[], options: BuildTranscriptOptions): string {
  const { nowMs, shortHandleByDid, timeZone = "America/New_York" } = options;
  const nameForDid = (did: string) => shortHandleByDid[did] ?? "someone";
  const visibleMessages = messages.filter((message) => !isDeleted(message));
  const idsInTranscript = new Set(visibleMessages.map((message) => message.id));

  const lines = visibleMessages.map((message) =>
    buildTranscriptLine(message, idsInTranscript, nameForDid, nowMs),
  );
  const body = lines.length > 0 ? lines.join("\n") : "(no messages)";
  if (options.header === false) return body;

  const legend =
    `recent chat, oldest first. now: ${formatNow(nowMs, timeZone)}. ` +
    `the {id} at the end of a line is that message's id: use it to reply to or react to that message. ` +
    `reactions on a message are shown in [brackets].`;
  return `${legend}\n\n${body}`;
}
