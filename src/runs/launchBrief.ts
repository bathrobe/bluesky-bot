// The launch brief (prompts/launch.md): the facts Homer must get right, added to heartbeat notes
// while the launch theme is on. See spec.md > Launch announcements.
//
// Where the end date lives: `launchThemeUntil` in state.json, so scripts/acceptGroup.ts can set it at
// runtime and Joe can end or extend it by editing that one field. config.launchThemeUntil is only the
// fallback when state.json has none (null = theme off).
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

export const LAUNCH_BRIEF_FILE = "launch.md";

export function pickLaunchThemeUntil(stateValue: string | null | undefined, configValue = config.launchThemeUntil): string | null {
  return stateValue ?? configValue ?? null;
}

// On while the date is in the future. Any Date.parse-able value works: "2026-11-21" (UTC midnight)
// or a full ISO time. A value that is set but unreadable throws, so a typo cannot silently end the theme.
export function isLaunchThemeOn(launchThemeUntil: string | null | undefined, nowMs: number): boolean {
  if (!launchThemeUntil) return false;
  const untilMs = Date.parse(launchThemeUntil);
  if (Number.isNaN(untilMs)) throw new Error(`launchThemeUntil is not a date: "${launchThemeUntil}"`);
  return untilMs > nowMs;
}

export function readLaunchBrief(promptsFolder: string = path.resolve(process.cwd(), "prompts")): string {
  return fs.readFileSync(path.resolve(promptsFolder, LAUNCH_BRIEF_FILE), "utf8").trim();
}
