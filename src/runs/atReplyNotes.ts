// The @-reply run notes: the mentioning message (sender, text, id), its age, and the brush-off note.
// Pure. The mention is always shown here, because a caught-up @ can be older than the transcript.
import { config } from "../config.ts";
import { describeEmbed, formatAge, formatNow } from "../transcriptParts.ts";
import { describePartOfDay, quoteForNotes, visibleMessagesOf } from "./heartbeatNoteParts.ts";

const OLD_MENTION_MS = 60 * 60 * 1000; // older than this, the notes say he may skip it on purpose
const MENTION_QUOTE_LENGTH = 600;

export type AtReplyNotesInput = {
  messages: any[]; // the run's transcript messages, oldest first
  mentionMessage: any; // the raw message that mentioned Homer, fetched fresh before the run
  budgetDecision: "answer" | "brush-off";
  nowMs: number;
  homerDid: string;
  shortHandleByDid?: Record<string, string>;
  timeZone?: string;
};

export function buildAtReplyNotes(input: AtReplyNotesInput): string {
  const { mentionMessage, nowMs, homerDid, shortHandleByDid = {}, timeZone = config.schedule.timeZone } = input;
  const senderName = shortHandleByDid[mentionMessage.sender?.did] ?? "someone";
  const mentionSentAtMs = Date.parse(mentionMessage.sentAt);
  const age = formatAge(mentionSentAtMs, nowMs);
  const quotedParts = [`"${quoteForNotes(mentionMessage.text, MENTION_QUOTE_LENGTH)}"`, describeEmbed(mentionMessage.embed)];
  const lines = [
    `- time: ${formatNow(nowMs, timeZone)} (${describePartOfDay(nowMs, timeZone)}).`,
    `- ${senderName} mentioned you. this run answers that one message and nothing else:`,
    `  - ${senderName}, ${age}: ${quotedParts.filter(Boolean).join(" ")} {${mentionMessage.id}}`,
  ];

  const visibleMessages = visibleMessagesOf(input.messages);
  if (visibleMessages.some((message) => message.id === mentionMessage.id)) {
    const newerMessages = visibleMessages.filter((message) => Date.parse(message.sentAt) > mentionSentAtMs);
    const newerFromHomer = newerMessages.filter((message) => message.sender?.did === homerDid).length;
    lines.push(`- it is in the transcript above. ${newerMessages.length} messages came after it (${newerFromHomer} yours).`);
  } else {
    lines.push("- it is older than the transcript above, so it is shown only here. its id still works for replyTo and react.");
  }
  lines.push(`- your first text or meme must have replyTo "${mentionMessage.id}".`);
  if (nowMs - mentionSentAtMs >= OLD_MENTION_MS) {
    lines.push(`- this @ is old (${age}): you were away when it came in. answer it late, or skip on purpose if the moment has passed.`);
  }
  if (input.budgetDecision === "brush-off") {
    const { atRepliesPerWindow, atReplyWindowMinutes } = config.caps;
    lines.push(
      `- brush-off: you already answered ${atRepliesPerWindow} @s here in the last ${atReplyWindowMinutes} minutes. keep this one to one line, no lookups.`,
    );
  }
  return `run notes (@-reply):\n${lines.join("\n")}`;
}
