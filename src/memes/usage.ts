// Meme cooldown, per conversation. Pure: no state file, no network. See spec.md > Cooldown rule.
// The same `findSpentFiles` feeds the prompt tags (createIsMemeSpent) and the plan check,
// so the tag the model sees is the rule the check enforces.
import { config } from "../config.ts";
import type { HomerState } from "../state.ts";
import type { IsMemeSpent } from "./catalog.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Everything the cooldown needs about ONE conversation. `lastUsedByFile` is file -> ISO time.
export type MemeUsage = {
  sendableFiles: string[]; // catalog files with a resolved post, in catalog order
  lastUsedByFile: Record<string, string>;
  lastOverrideAt: string | null; // ISO time of this conversation's last on-the-nose override
  nowMs: number;
};

// Usage is keyed by conversation, so a meme used in the test DM is still fresh in the group.
export function memeUsageForConvo(state: HomerState, convoId: string, sendableFiles: string[], nowMs: number): MemeUsage {
  return {
    sendableFiles,
    lastUsedByFile: state.memeLastUsed[convoId] ?? {},
    lastOverrideAt: state.lastOverrideAtByConvo[convoId] ?? null,
    nowMs,
  };
}

// An unreadable time counts as "used long ago" (0), never as "never used".
function timeOf(isoTime: string): number {
  const timeMs = Date.parse(isoTime);
  return Number.isNaN(timeMs) ? 0 : timeMs;
}

// While any catalog meme has never been used here: every used one is spent.
// Once all are used: the least recently used quarter (rounded up, so at least one) is fresh again.
// Ties on time keep catalog order. Usage of files no longer in the catalog is ignored.
export function findSpentFiles(catalogFiles: string[], lastUsedByFile: Record<string, string>): Set<string> {
  const usedFiles = catalogFiles.filter((file) => lastUsedByFile[file] !== undefined);
  if (usedFiles.length < catalogFiles.length) return new Set(usedFiles);
  const freshAgainCount = Math.ceil(catalogFiles.length * config.memeCooldown.freshAgainFraction);
  const leastRecentFirst = [...usedFiles].sort((fileA, fileB) => timeOf(lastUsedByFile[fileA]) - timeOf(lastUsedByFile[fileB]));
  return new Set(leastRecentFirst.slice(freshAgainCount));
}

// For renderCatalogForPrompt: tags each entry `spent` or `fresh` for this conversation.
export function createIsMemeSpent(catalogFiles: string[], lastUsedByFile: Record<string, string>): IsMemeSpent {
  const spentFiles = findSpentFiles(catalogFiles, lastUsedByFile);
  return (file) => spentFiles.has(file);
}

export function wholeDaysSince(isoTime: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - timeOf(isoTime)) / MS_PER_DAY));
}

export type OverrideDecision = { allowed: true } | { allowed: false; why: string };

// The on-the-nose override for a spent meme: last used MORE than 30 days ago, and no override
// in this conversation in the last 7 days. `why` is written for the model.
export function decideOnTheNoseOverride(file: string, usage: MemeUsage): OverrideDecision {
  const { onTheNoseMinDaysSinceUse, onTheNoseMinDaysBetweenOverrides } = config.memeCooldown;
  const lastUsedAt = usage.lastUsedByFile[file];
  if (lastUsedAt !== undefined && usage.nowMs - timeOf(lastUsedAt) <= onTheNoseMinDaysSinceUse * MS_PER_DAY) {
    return {
      allowed: false,
      why: `it was last used ${wholeDaysSince(lastUsedAt, usage.nowMs)} days ago, and the override only works on a meme last used more than ${onTheNoseMinDaysSinceUse} days ago`,
    };
  }
  if (usage.lastOverrideAt && usage.nowMs - timeOf(usage.lastOverrideAt) < onTheNoseMinDaysBetweenOverrides * MS_PER_DAY) {
    return {
      allowed: false,
      why: `you already used an override ${wholeDaysSince(usage.lastOverrideAt, usage.nowMs)} days ago, and you get one every ${onTheNoseMinDaysBetweenOverrides} days`,
    };
  }
  return { allowed: true };
}
