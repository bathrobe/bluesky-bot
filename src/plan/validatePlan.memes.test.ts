import { describe, expect, it } from "vitest";
import { memeOverrideFiles } from "./memeRules.ts";
import { validatePlan } from "./validatePlan.ts";
import { makeContext, planOf } from "./validatePlanTestHelpers.ts";

const NOW_MS = Date.parse("2026-11-14T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW_MS - days * 24 * 60 * 60 * 1000).toISOString();
const sendableFiles = ["soup-cat.jpeg", "horse-stare.png", "old-dog.jpeg", "never-used.gif"];
const meme = (file: string, why?: string) => ({ type: "meme", file, ...(why ? { onTheNose: { why } } : {}) });

// soup-cat used 3 days ago, horse-stare 45 days ago, old-dog 60 days ago; never-used is fresh.
function memeContext(lastOverrideAt: string | null = null) {
  const lastUsedByFile = { "soup-cat.jpeg": daysAgo(3), "horse-stare.png": daysAgo(45), "old-dog.jpeg": daysAgo(60) };
  return makeContext({ memeUsage: { sendableFiles, lastUsedByFile, lastOverrideAt, nowMs: NOW_MS } });
}

function errorOf(rawPlan: string, context = memeContext()): string {
  const result = validatePlan(rawPlan, context);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("validatePlan: meme exists", () => {
  it("rejects every meme when the run has no catalog", () => {
    expect(errorOf(planOf(meme("never-used.gif")), makeContext())).toContain("action 1 (meme): memes can't be sent in this run: no meme catalog is loaded");
  });

  it("rejects an unknown file with 'not in the catalog'", () => {
    const error = errorOf(planOf(meme("soup-cat.jpg")));
    expect(error).toContain('action 1 (meme): "soup-cat.jpg" is not in the catalog. copy a filename exactly from the meme catalog');
    expect(error).toContain("don't guess");
  });

  it("an unknown file is not saved by onTheNose", () => {
    expect(errorOf(planOf(meme("made-up.png", "perfect")))).toContain("not in the catalog");
  });
});

describe("validatePlan: meme cooldown", () => {
  it("accepts a fresh meme", () => {
    expect(validatePlan(planOf(meme("never-used.gif")), memeContext()).ok).toBe(true);
  });

  it("rejects a spent meme and says to pick a fresh one", () => {
    const error = errorOf(planOf(meme("soup-cat.jpeg")));
    expect(error).toContain('action 1 (meme): "soup-cat.jpeg" is `spent`: you already used it in this chat, 3 days ago. pick one tagged `fresh`');
  });

  it("rejects the same meme twice in one plan", () => {
    const error = errorOf(planOf(meme("never-used.gif"), meme("never-used.gif")));
    expect(error).toContain('action 2 (meme): this plan already drops "never-used.gif"');
  });

  it("accepts the on-the-nose override and keeps it on the validated plan", () => {
    const result = validatePlan(planOf(meme("horse-stare.png", "the horse thing came back")), memeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(memeOverrideFiles(result.plan)).toEqual(["horse-stare.png"]);
  });

  it("refuses the override inside 30 days and says why", () => {
    const error = errorOf(planOf(meme("soup-cat.jpeg", "soup again")));
    expect(error).toContain('"soup-cat.jpeg" is `spent` and the on-the-nose override is refused: it was last used 3 days ago');
    expect(error).toContain("more than 30 days ago. pick one tagged `fresh`");
  });

  it("refuses a second override inside 7 days", () => {
    const error = errorOf(planOf(meme("horse-stare.png", "again")), memeContext(daysAgo(2)));
    expect(error).toContain("the on-the-nose override is refused: you already used an override 2 days ago, and you get one every 7 days");
  });

  it("refuses two overrides in one plan", () => {
    const error = errorOf(planOf(meme("horse-stare.png", "one"), meme("old-dog.jpeg", "two")));
    expect(error).toContain("action 2 (meme)");
    expect(error).toContain("an earlier action in this plan already uses the override");
    expect(error).not.toContain("action 1 (meme)");
  });

  it("drops an unneeded onTheNose from a fresh meme, so it is not recorded as an override", () => {
    const result = validatePlan(planOf(meme("never-used.gif", "not needed")), memeContext(daysAgo(1)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(memeOverrideFiles(result.plan)).toEqual([]);
    expect(result.plan.actions[0]).toEqual({ type: "meme", file: "never-used.gif" });
  });
});
