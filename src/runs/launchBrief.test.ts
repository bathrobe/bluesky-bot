import { describe, expect, it } from "vitest";
import { HOMER_DID, NOW_MS, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { buildHeartbeatNotes } from "./heartbeat.ts";
import { isLaunchThemeOn, pickLaunchThemeUntil, readLaunchBrief } from "./launchBrief.ts";

const BRIEF = "# launch brief\n- you are a bot.";
const messages = [makeMessage({ id: "m1", text: "hello", sentAt: "2026-11-14T18:00:00.000Z" })];
const DAY_MS = 24 * 60 * 60 * 1000;
const tomorrow = new Date(NOW_MS + DAY_MS).toISOString();
const yesterday = new Date(NOW_MS - DAY_MS).toISOString();

function notesWith(launchThemeUntil: string | null | undefined, extra = {}) {
  return buildHeartbeatNotes({
    messages, state: { lastHeartbeatAt: null }, nowMs: NOW_MS, homerDid: HOMER_DID, shortHandleByDid,
    launchThemeUntil, launchBriefText: BRIEF, ...extra,
  });
}

describe("launch brief in the heartbeat notes", () => {
  it("is present, after the run notes, while the date is in the future", () => {
    const notes = notesWith(tomorrow, { operatorNote: "hi" });
    expect(notes.startsWith("run notes (heartbeat):")).toBe(true);
    expect(notes.endsWith(`\n\n${BRIEF}`)).toBe(true);
    expect(notes.indexOf("note from joe")).toBeLessThan(notes.indexOf(BRIEF));
  });

  it("is absent when the date has passed or is unset", () => {
    expect(notesWith(yesterday)).not.toContain("launch brief");
    expect(notesWith(null)).not.toContain("launch brief");
    expect(notesWith(undefined)).not.toContain("launch brief");
  });

  it("accepts a bare date and throws on a value that is not a date", () => {
    expect(isLaunchThemeOn("2099-01-01", NOW_MS)).toBe(true);
    expect(isLaunchThemeOn("2000-01-01", NOW_MS)).toBe(false);
    expect(() => isLaunchThemeOn("next tuesday", NOW_MS)).toThrow(/not a date/);
  });
});

describe("pickLaunchThemeUntil", () => {
  it("prefers state.json's value, falls back to config's, else null", () => {
    expect(pickLaunchThemeUntil("2026-11-21", "2026-12-01")).toBe("2026-11-21");
    expect(pickLaunchThemeUntil(null, "2026-12-01")).toBe("2026-12-01");
    expect(pickLaunchThemeUntil(undefined, null)).toBeNull();
  });
});

describe("prompts/launch.md", () => {
  it("names the model, the co-op, and the way out", () => {
    const brief = readLaunchBrief();
    expect(brief).toContain("tinfoil/deepseek-v4-1-flash");
    expect(brief).toContain("inference.coop");
    expect(brief).toContain("free to leave");
  });
});
