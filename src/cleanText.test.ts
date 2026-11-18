import { describe, expect, it } from "vitest";
import { cleanText, normalizeEscapedNewlines, stripControlTokens } from "./cleanText.ts";

describe("stripControlTokens", () => {
  it("leaves normal text alone", () => {
    expect(stripControlTokens("lol same")).toEqual({ clean: "lol same", found: false });
  });

  it("cuts at the earliest control token and keeps the clean prefix", () => {
    const raw = "meeting at 5 </｜DDSML｜parameter></think> garbage";
    expect(stripControlTokens(raw)).toEqual({ clean: "meeting at 5", found: true });
  });

  it("catches think tags, ascii pipes and invoke markup", () => {
    expect(stripControlTokens("hi <think>hmm").clean).toBe("hi");
    expect(stripControlTokens("hi <|end|>").clean).toBe("hi");
    expect(stripControlTokens('ok <invoke name="post">').clean).toBe("ok");
  });
});

describe("normalizeEscapedNewlines", () => {
  it("turns literal backslash-n and /n into real newlines", () => {
    expect(normalizeEscapedNewlines("esoterica 2.0/n/n two amphoras\\nthree")).toBe("esoterica 2.0\n\n two amphoras\nthree");
  });

  it("leaves links and words like w/new alone", () => {
    expect(normalizeEscapedNewlines("see https://example.com/news")).toBe("see https://example.com/news");
    expect(normalizeEscapedNewlines("came w/new shoes")).toBe("came w/new shoes");
  });
});

describe("cleanText", () => {
  it("strips tokens, fixes newlines, and trims", () => {
    expect(cleanText("  one\\ntwo </think>junk")).toEqual({ text: "one\ntwo", foundControlTokens: true });
  });

  it("returns empty text when only garbage was there, so the plan check can reject it", () => {
    expect(cleanText("<think>all reasoning</think>").text).toBe("");
    expect(cleanText("\\n").text).toBe("");
  });
});
