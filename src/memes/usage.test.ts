import { describe, expect, it } from "vitest";
import { createDefaultState } from "../state.ts";
import { renderCatalogForPrompt } from "./catalog.ts";
import { createIsMemeSpent, decideOnTheNoseOverride, findSpentFiles, memeUsageForConvo } from "./usage.ts";

const NOW_MS = Date.parse("2026-11-14T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW_MS - days * 24 * 60 * 60 * 1000).toISOString();
const eightFiles = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg", "g.jpg", "h.jpg"];
const spentList = (files: string[], lastUsedByFile: Record<string, string>) => [...findSpentFiles(files, lastUsedByFile)].sort();

describe("findSpentFiles", () => {
  it("nothing is spent when nothing was used, or the catalog is empty", () => {
    expect(spentList(eightFiles, {})).toEqual([]);
    expect(spentList([], { "a.jpg": daysAgo(1) })).toEqual([]);
  });

  it("a used meme is spent while any never-used meme remains, however old the use", () => {
    expect(spentList(eightFiles, { "a.jpg": daysAgo(400), "c.jpg": daysAgo(1) })).toEqual(["a.jpg", "c.jpg"]);
  });

  it("once every meme is used, the least recently used quarter is fresh again", () => {
    const lastUsedByFile = Object.fromEntries(eightFiles.map((file, index) => [file, daysAgo(index + 1)]));
    // h (8 days ago) and g (7 days ago) are the oldest quarter of 8.
    expect(spentList(eightFiles, lastUsedByFile)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]);
  });

  it("the quarter rounds up, so at least one meme is always fresh", () => {
    expect(spentList(["a.jpg"], { "a.jpg": daysAgo(1) })).toEqual([]);
    const fiveFiles = eightFiles.slice(0, 5);
    const lastUsedByFile = Object.fromEntries(fiveFiles.map((file, index) => [file, daysAgo(index + 1)]));
    expect(spentList(fiveFiles, lastUsedByFile)).toEqual(["a.jpg", "b.jpg", "c.jpg"]); // ceil(5/4) = 2 fresh: e, d
  });

  it("ties on time keep catalog order", () => {
    const lastUsedByFile = Object.fromEntries(eightFiles.map((file) => [file, daysAgo(3)]));
    expect(spentList(eightFiles, lastUsedByFile)).toEqual(["c.jpg", "d.jpg", "e.jpg", "f.jpg", "g.jpg", "h.jpg"]);
  });

  it("a meme added after everything was used makes every used one spent again", () => {
    const lastUsedByFile = Object.fromEntries(eightFiles.map((file, index) => [file, daysAgo(index + 1)]));
    expect(spentList([...eightFiles, "new.jpg"], lastUsedByFile)).toEqual(eightFiles);
  });

  it("ignores usage of files that left the catalog", () => {
    expect(spentList(["a.jpg", "b.jpg"], { "a.jpg": daysAgo(2), "gone.jpg": daysAgo(1) })).toEqual(["a.jpg"]);
  });
});

describe("per conversation", () => {
  it("use in the DM does not spend a meme for the group", () => {
    const state = createDefaultState();
    state.memeLastUsed = { dmConvo: { "a.jpg": daysAgo(1) } };
    state.lastOverrideAtByConvo = { dmConvo: daysAgo(2) };
    const dmUsage = memeUsageForConvo(state, "dmConvo", eightFiles, NOW_MS);
    const groupUsage = memeUsageForConvo(state, "groupConvo", eightFiles, NOW_MS);
    expect(spentList(dmUsage.sendableFiles, dmUsage.lastUsedByFile)).toEqual(["a.jpg"]);
    expect(spentList(groupUsage.sendableFiles, groupUsage.lastUsedByFile)).toEqual([]);
    expect(groupUsage.lastOverrideAt).toBeNull();
  });
});

describe("createIsMemeSpent", () => {
  it("tags the prompt catalog with the same rule", () => {
    const entries = ["a.jpg", "b.jpg"].map((file) => ({ file, description: "d", goodFor: "g", post: "https://x" }));
    const rendered = renderCatalogForPrompt(entries, createIsMemeSpent(["a.jpg", "b.jpg"], { "b.jpg": daysAgo(1) }));
    expect(rendered).toContain("a.jpg [fresh]");
    expect(rendered).toContain("b.jpg [spent]");
  });
});

describe("decideOnTheNoseOverride", () => {
  const usageWith = (lastUsedDaysAgo: number, lastOverrideAt: string | null = null) => ({
    sendableFiles: eightFiles, lastUsedByFile: { "a.jpg": daysAgo(lastUsedDaysAgo) }, lastOverrideAt, nowMs: NOW_MS,
  });

  it("allows a meme last used more than 30 days ago with no recent override", () => {
    expect(decideOnTheNoseOverride("a.jpg", usageWith(31))).toEqual({ allowed: true });
    expect(decideOnTheNoseOverride("a.jpg", usageWith(31, daysAgo(7)))).toEqual({ allowed: true });
  });

  it("refuses inside 30 days (exactly 30 is still inside)", () => {
    const refused = decideOnTheNoseOverride("a.jpg", usageWith(12));
    expect(refused.allowed === false && refused.why).toMatch(/last used 12 days ago.*more than 30 days ago/);
    expect(decideOnTheNoseOverride("a.jpg", usageWith(30)).allowed).toBe(false);
  });

  it("refuses a second override inside 7 days", () => {
    const refused = decideOnTheNoseOverride("a.jpg", usageWith(90, daysAgo(3)));
    expect(refused.allowed === false && refused.why).toMatch(/already used an override 3 days ago.*one every 7 days/);
  });
});
