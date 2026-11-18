import { describe, expect, it } from "vitest";
import { createDefaultState } from "../state.ts";
import { CATALOG_HEADER, prepareMemeRun, recordMemeUsage } from "./runMemes.ts";

const CONVO = "convo1";
const soupMeme = { file: "soup.jpg", description: "soup", goodFor: "soup talk", post: "p1", uri: "at://x/1", cid: "c1" };
const memeAction = (file: string, onTheNose?: { why: string }) => ({ type: "meme" as const, file, ...(onTheNose ? { onTheNose } : {}) });

describe("prepareMemeRun", () => {
  it("puts the header above the tagged lines", () => {
    const memeRun = prepareMemeRun({ sendableMemes: [soupMeme], state: createDefaultState(), convoId: CONVO, nowMs: 0 });
    expect(memeRun.catalogText).toBe(`${CATALOG_HEADER}\nsoup.jpg [fresh] for: soup talk | shows: soup`);
    expect(memeRun.memeUsage).toMatchObject({ sendableFiles: ["soup.jpg"], lastUsedByFile: {}, lastOverrideAt: null });
  });

  it("leaves the catalog out when nothing is sendable", () => {
    const memeRun = prepareMemeRun({ sendableMemes: [], state: createDefaultState(), convoId: CONVO, nowMs: 0 });
    expect(memeRun.catalogText).toBeUndefined();
    expect(memeRun.memeUsage.sendableFiles).toEqual([]);
  });
});

describe("recordMemeUsage", () => {
  it("records landed memes only, and lastOverrideAt only for an override", () => {
    const state = createDefaultState();
    recordMemeUsage(state, CONVO, [
      { action: { type: "text", text: "hi" }, messageId: "t1" },
      { action: memeAction("a.jpg"), messageId: "m1" },
      { action: memeAction("b.jpg", { why: "perfect" }), messageId: "m2" },
      { action: memeAction("c.jpg"), error: "503" },
    ], "2026-11-14T20:00:00.000Z");
    expect(state.memeLastUsed).toEqual({ [CONVO]: { "a.jpg": "2026-11-14T20:00:00.000Z", "b.jpg": "2026-11-14T20:00:00.000Z" } });
    expect(state.lastOverrideAtByConvo).toEqual({ [CONVO]: "2026-11-14T20:00:00.000Z" });
  });

  it("keeps other files and conversations", () => {
    const state = { ...createDefaultState(), memeLastUsed: { [CONVO]: { "old.jpg": "t0" }, other: { "a.jpg": "t0" } } };
    recordMemeUsage(state, CONVO, [{ action: memeAction("a.jpg"), messageId: "m1" }], "t1");
    expect(state.memeLastUsed).toEqual({ [CONVO]: { "old.jpg": "t0", "a.jpg": "t1" }, other: { "a.jpg": "t0" } });
    expect(state.lastOverrideAtByConvo).toEqual({});
  });
});
