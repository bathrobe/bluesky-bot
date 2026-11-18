import { describe, expect, it } from "vitest";
import { validatePlan } from "./validatePlan.ts";
import { makeContext, planOf, react, text } from "./validatePlanTestHelpers.ts";

const [soupId, mentionId] = ["3msg000000001", "3msg000000002"];

describe("validatePlan: text hygiene", () => {
  it("passes and carries the cleaned text", () => {
    const result = validatePlan(planOf(text("  soup\\nis a drink </think> leaked")), makeContext());
    expect(result).toEqual({ ok: true, plan: { reason: "test", actions: [{ type: "text", text: "soup\nis a drink" }] } });
  });

  it("rejects text that is empty after cleaning", () => {
    const result = validatePlan(planOf(text("<think>only reasoning")), makeContext());
    expect(result.ok === false && result.error).toContain("action 1 (text): the text is empty");
    expect(validatePlan(planOf(text("   ")), makeContext()).ok).toBe(false);
  });
});

describe("validatePlan: gm shape", () => {
  const gm = makeContext({ runKind: "gm" });

  it("passes one text, or an empty list", () => {
    expect(validatePlan(planOf(text("gm")), gm).ok).toBe(true);
    expect(validatePlan(planOf(), gm).ok).toBe(true);
  });

  it("rejects two texts, or a reaction", () => {
    const twoTexts = validatePlan(planOf(text("gm"), text("gm again")), gm);
    expect(twoTexts.ok === false && twoTexts.error).toContain("this is the morning gm run");
    const withReact = validatePlan(planOf(react(soupId, "🔥")), gm);
    expect(withReact.ok === false && withReact.error).toContain("yours has: react.");
  });

  it("does not apply outside gm runs", () => {
    expect(validatePlan(planOf(text("a"), text("b")), makeContext()).ok).toBe(true);
  });
});

describe("validatePlan: @-reply shape", () => {
  const atReply = makeContext({ runKind: "at-reply", mentioningMessageId: mentionId });

  it("passes when the first text replies to the mention (a react may come first)", () => {
    expect(validatePlan(planOf(react(mentionId, "💜"), text("hi", mentionId)), atReply).ok).toBe(true);
    const twoMessages = validatePlan(planOf(text("hi", mentionId), text("also", mentionId)), atReply);
    expect(twoMessages.ok).toBe(false);
    expect((twoMessages as any).error).toContain("one message");
    expect(validatePlan(planOf(), atReply).ok).toBe(true);
  });

  it("rejects a first text with no replyTo, or replying to another message", () => {
    const noReply = validatePlan(planOf(text("hi")), atReply);
    expect(noReply.ok === false && noReply.error).toContain(`your first text or meme must have replyTo "${mentionId}"`);
    const wrongReply = validatePlan(planOf(text("hi", soupId)), atReply);
    expect(wrongReply.ok === false && wrongReply.error).toContain(`yours has replyTo "${soupId}"`);
  });

  it("does not apply outside @-reply runs", () => {
    expect(validatePlan(planOf(text("hi")), makeContext()).ok).toBe(true);
  });
});

describe("validatePlan: error format", () => {
  it("lists every problem at once, after a header saying nothing was sent", () => {
    const result = validatePlan(planOf(react("3madeup", "🔥"), text("")), makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.startsWith("plan rejected, nothing was sent. fix these and call post again:\n- ")).toBe(true);
    expect(result.error.split("\n- ")).toHaveLength(3);
  });
});
