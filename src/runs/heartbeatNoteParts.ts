// Small pure pieces of the heartbeat run notes. buildHeartbeatNotes in heartbeat.ts joins them.
import { flattenText, isDeleted } from "../transcriptParts.ts";
import { hasMentionFacetFor } from "../triggers/mentions.ts";

const HOMER_NAME_PATTERN = /\bhomer\b/i; // word match: "homer", "Homer's", not "homeric"

export function saysHomerByName(message: any): boolean {
  return HOMER_NAME_PATTERN.test(message.text ?? "");
}

// "morning", "afternoon"… from the hour in the given time zone.
export function describePartOfDay(nowMs: number, timeZone: string): string {
  const hourText = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(nowMs));
  const hour = Number(hourText);
  if (hour < 5) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function visibleMessagesOf(messages: any[]): any[] {
  return messages.filter((message) => !isDeleted(message));
}

// When "since the last tick" starts. With no recorded heartbeat (fresh or lost state, dry runs),
// fall back to Homer's newest message, as spec.md > Data and state does; with neither, everything counts.
export function lastTickMs(visibleMessages: any[], lastHeartbeatAt: string | null, homerDid: string): number {
  if (lastHeartbeatAt) return Date.parse(lastHeartbeatAt);
  const homerMessages = visibleMessages.filter((message) => message.sender?.did === homerDid);
  const newestHomerMessage = homerMessages[homerMessages.length - 1];
  return newestHomerMessage ? Date.parse(newestHomerMessage.sentAt) : 0;
}

// Messages from other people, after the last tick, that say "homer" without a real mention of him.
// (A real mention is the @-reply trigger's job, not the heartbeat's.)
export function findNameSaidMessages(visibleMessages: any[], sinceMs: number, homerDid: string): any[] {
  return visibleMessages.filter(
    (message) =>
      message.sender?.did !== homerDid &&
      Date.parse(message.sentAt) > sinceMs &&
      saysHomerByName(message) &&
      !hasMentionFacetFor(message, homerDid),
  );
}

export function quoteForNotes(text: string | undefined, maxLength = 200): string {
  const flat = flattenText(text);
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}
