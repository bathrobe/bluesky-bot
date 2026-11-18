// Morning gm: the run notes, the "already said gm today" check, what a finished gm records, and the run.
// See spec.md > Morning gm. No meme catalog and no lookup tools; the plan check allows one text or none.
import { config } from "../config.ts";
import { easternDateKey } from "../easternDate.ts";
import type { HomerState } from "../state.ts";
import { formatAge, formatNow } from "../transcriptParts.ts";
import { describePartOfDay, visibleMessagesOf } from "./heartbeatNoteParts.ts";
import { runShared, type RunResult, type RunSharedOptions } from "./runShared.ts";

const RECENT_HOURS = 2; // "is a conversation going on right now?"
const OVERNIGHT_HOURS = 12;

export type MorningGmNotesInput = {
  messages: any[]; // raw getMessages items, oldest first
  nowMs: number;
  homerDid: string;
  shortHandleByDid?: Record<string, string>;
  timeZone?: string;
};

// Pure: what the model needs to judge "is a greeting welcome, or is the room tense / mid-serious-conversation?"
export function buildMorningGmNotes(input: MorningGmNotesInput): string {
  const { nowMs, homerDid, shortHandleByDid = {}, timeZone = config.schedule.timeZone } = input;
  const nameForDid = (did: string) => (did === homerDid ? "you" : (shortHandleByDid[did] ?? "someone"));
  const visibleMessages = visibleMessagesOf(input.messages);
  const newestMessage = visibleMessages[visibleMessages.length - 1];
  const lines = [`- time: ${formatNow(nowMs, timeZone)} (${describePartOfDay(nowMs, timeZone)}).`];
  if (!newestMessage) {
    lines.push(`- nobody has spoken in the last ${config.caps.historyMaxAgeDays} days.`);
    return `run notes (morning gm):\n${lines.join("\n")}`;
  }
  const newestAge = formatAge(Date.parse(newestMessage.sentAt), nowMs);
  lines.push(`- last message in the chat: ${newestAge}, from ${nameForDid(newestMessage.sender?.did)}.`);
  for (const hours of [RECENT_HOURS, OVERNIGHT_HOURS]) {
    const sinceMs = nowMs - hours * 3_600_000;
    const fromOthers = visibleMessages.filter(
      (message) => Date.parse(message.sentAt) > sinceMs && message.sender?.did !== homerDid,
    );
    const peopleCount = new Set(fromOthers.map((message) => message.sender?.did)).size;
    lines.push(`- in the last ${hours} hours: ${fromOthers.length} messages from others (${peopleCount} people).`);
  }
  if (newestMessage.sender?.did === homerDid) lines.push("- nobody has spoken since your last post.");
  lines.push("- read the last few messages for tone. if a heavy or serious conversation is still going, skip.");
  return `run notes (morning gm):\n${lines.join("\n")}`;
}

// The once-per-Eastern-day rule, for manual runs (the scheduler checks the same field itself).
export function alreadySaidGmToday(state: Pick<HomerState, "lastGmDate">, now: Date = new Date()): boolean {
  return state.lastGmDate === easternDateKey(now);
}

// A finished live gm (a greeting or a deliberate skip). Both fields matter: lastGmDate stops a second gm
// today, lastGmAt keeps the heartbeat an hour away (triggers/schedule.ts).
export function recordFinishedGm(state: HomerState, finishedAtIso: string): void {
  state.lastGmDate = easternDateKey(new Date(finishedAtIso));
  state.lastGmAt = finishedAtIso;
}

export type RunMorningGmOptions = {
  dryRun: boolean;
  dependencies?: RunSharedOptions["dependencies"]; // tests inject fakes
};

export async function runMorningGm(options: RunMorningGmOptions): Promise<RunResult> {
  return runShared({
    runKind: "gm",
    skillFile: "morning-gm.md",
    dryRun: options.dryRun,
    dependencies: options.dependencies,
    buildRunNotes: (context) => buildMorningGmNotes({ ...context, timeZone: config.schedule.timeZone }),
    recordFinishedRun: recordFinishedGm, // live only; runShared skips it in dry mode and on failure
  });
}
