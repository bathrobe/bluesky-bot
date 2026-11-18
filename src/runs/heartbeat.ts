// Heartbeat: the run notes the model reads under the transcript, and the run itself.
// See spec.md > Heartbeat. The notes builder is pure: (messages, state, now) in, text out.
import { config } from "../config.ts";
import type { HomerState } from "../state.ts";
import { createLookupTools } from "../tools/lookupTools.ts";
import { messageIdsHomerRepliedTo } from "../plan/repeatReplyRule.ts";
import { formatAge, formatNow } from "../transcriptParts.ts";
import { isLaunchThemeOn, pickLaunchThemeUntil, readLaunchBrief } from "./launchBrief.ts";
import { buildHabitNoteLines } from "./heartbeatHabitNotes.ts";
import { describePartOfDay, findNameSaidMessages, lastTickMs, quoteForNotes, visibleMessagesOf } from "./heartbeatNoteParts.ts";
import { runShared, type RunResult, type RunSharedOptions } from "./runShared.ts";

const SHARE_WINDOW = 20;

export type HeartbeatNotesInput = {
  messages: any[]; // raw getMessages items, oldest first
  state: Pick<HomerState, "lastHeartbeatAt">;
  nowMs: number;
  homerDid: string;
  shortHandleByDid?: Record<string, string>;
  timeZone?: string;
  operatorNote?: string; // `pnpm tick --note "..."`, test DM only
  launchThemeUntil?: string | null; // the brief is added while this date is in the future
  launchBriefText?: string; // prompts/launch.md, read by the caller
};

export function buildHeartbeatNotes(input: HeartbeatNotesInput): string {
  const { nowMs, homerDid, shortHandleByDid = {}, timeZone = config.schedule.timeZone } = input;
  const nameForDid = (did: string) => (did === homerDid ? "you" : (shortHandleByDid[did] ?? "someone"));
  const visibleMessages = visibleMessagesOf(input.messages);
  const newestMessage = visibleMessages[visibleMessages.length - 1];
  const lines = [`- time: ${formatNow(nowMs, timeZone)} (${describePartOfDay(nowMs, timeZone)}).`];

  if (!newestMessage) {
    lines.push(`- nobody has spoken in the last ${config.caps.historyMaxAgeDays} days.`);
  } else {
    const newestAge = formatAge(Date.parse(newestMessage.sentAt), nowMs);
    lines.push(`- last message in the chat: ${newestAge}, from ${nameForDid(newestMessage.sender?.did)}.`);
    const lastFew = visibleMessages.slice(-SHARE_WINDOW);
    const homerCount = lastFew.filter((message) => message.sender?.did === homerDid).length;
    lines.push(`- ${homerCount} of the last ${lastFew.length} messages are yours.`);
  }

  const sinceMs = lastTickMs(visibleMessages, input.state.lastHeartbeatAt, homerDid);
  const nameSaidMessages = findNameSaidMessages(visibleMessages, sinceMs, homerDid);
  if (nameSaidMessages.length > 0) {
    lines.push("- someone said your name since your last tick (by name, not a real mention):");
    for (const message of nameSaidMessages) {
      const age = formatAge(Date.parse(message.sentAt), nowMs);
      lines.push(`  - ${nameForDid(message.sender?.did)}, ${age}: "${quoteForNotes(message.text)}" {${message.id}}`);
    }
  }
  const answeredIds = messageIdsHomerRepliedTo(visibleMessages, homerDid, sinceMs);
  if (answeredIds.length > 0) lines.push(`- already answered by you since your last tick: ${answeredIds.map((id) => `{${id}}`).join(", ")}. those are closed.`);
  if (newestMessage?.sender?.did === homerDid) lines.push("- nobody has spoken since your last post.");
  lines.push(...buildHabitNoteLines(visibleMessages, homerDid));
  if (describePartOfDay(nowMs, timeZone) === "morning") lines.push("- the morning gm is sent by a separate run, not this one.");
  if (input.operatorNote) lines.push(`- note from joe (your operator) for this run: ${input.operatorNote}`);
  const notes = `run notes (heartbeat):\n${lines.join("\n")}`;
  const launchThemeOn = input.launchBriefText && isLaunchThemeOn(input.launchThemeUntil, nowMs);
  return launchThemeOn ? `${notes}\n\n${input.launchBriefText}` : notes;
}

export type RunHeartbeatOptions = {
  dryRun: boolean;
  operatorNote?: string;
  dependencies?: RunSharedOptions["dependencies"]; // tests inject fakes
};

export function assertOperatorNoteAllowed(operatorNote: string | undefined, target: string = config.target): void {
  if (operatorNote && target === "group") throw new Error("--note is for the test DM only; refused while target is group");
}

export async function runHeartbeat(options: RunHeartbeatOptions): Promise<RunResult> {
  assertOperatorNoteAllowed(options.operatorNote);
  return runShared({
    runKind: "heartbeat",
    skillFile: "heartbeat.md",
    includeMemeCatalog: true,
    buildLookupTools: createLookupTools, // search_chat, search_bluesky, bluesky_user_posts, read_link; 4 calls per run shared
    dryRun: options.dryRun,
    dependencies: options.dependencies,
    buildRunNotes: (context) =>
      buildHeartbeatNotes({
        ...context,
        timeZone: config.schedule.timeZone,
        operatorNote: options.operatorNote,
        launchThemeUntil: pickLaunchThemeUntil(context.state.launchThemeUntil),
        launchBriefText: readLaunchBrief(),
      }),
    // Live runs only (runShared skips this in dry mode): a finished heartbeat moves the schedule on.
    recordFinishedRun: (state, finishedAtIso) => {
      state.lastHeartbeatAt = finishedAtIso;
    },
  });
}
