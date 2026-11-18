import { describe, expect, it } from "vitest";
import { validatePlan } from "./validatePlan.ts";
import { makeContext, planOf, react, text } from "./validatePlanTestHelpers.ts";

const [soupId, mentionId] = ["3msg000000001", "3msg000000002"];

describe("validatePlan: parsing", () => {
  it("accepts an empty plan (skip) from a JSON string", () => {
    expect(validatePlan(planOf(), makeContext())).toEqual({ ok: true, plan: { reason: "test", actions: [] } });
  });

  it("rejects bad JSON and a bad shape with text for the model", () => {
    const badJson = validatePlan("{reason:", makeContext());
    expect(badJson.ok === false && badJson.error).toMatch(/not valid JSON/);
    const badShape = validatePlan({ reason: "x", actions: [{ type: "dance" }] }, makeContext());
    expect(badShape.ok === false && badShape.error).toMatch(/wrong shape.*call post again/s);
  });
});

describe("validatePlan: send cap", () => {
  it("passes at the caps", () => {
    const actions = [...Array(5)].map((_, i) => text(`line ${i}`));
    const reacts = [react(soupId, "🔥"), react(soupId, "🫠"), react(mentionId, "💜")];
    expect(validatePlan(planOf(...actions, ...reacts), makeContext()).ok).toBe(true);
  });

  it("rejects a sixth message and a fourth reaction", () => {
    const actions = [...Array(6)].map((_, i) => text(`line ${i}`));
    const reacts = [react(soupId, "🔥"), react(soupId, "🫠"), react(mentionId, "💜"), react(mentionId, "🔥")];
    const result = validatePlan(planOf(...actions, ...reacts), makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("too many messages: 6 text + meme actions, the limit is 5. drop 1.");
    expect(result.error).toContain("too many reactions: 4 react actions, the limit is 3. drop 1.");
  });
});

describe("validatePlan: real messages only", () => {
  it("passes ids from the transcript and from lookup results", () => {
    const context = makeContext({ knownMessageIds: new Set([soupId, mentionId, "3searchresult"]) });
    expect(validatePlan(planOf(text("lol", "3searchresult"), react(soupId, "🔥")), context).ok).toBe(true);
  });

  it("rejects a made-up messageId and a made-up replyTo", () => {
    const result = validatePlan(planOf(react("3madeup", "🔥"), text("lol", "3alsomadeup")), makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('action 1 (react): messageId "3madeup" is not a real message id');
    expect(result.error).toContain('action 2 (text): replyTo "3alsomadeup" is not a real message id');
  });
});

describe("validatePlan: no repeat reactions", () => {
  it("passes an emoji someone else used, or one Homer has not used", () => {
    expect(validatePlan(planOf(react(soupId, "😂"), react(soupId, "🔥")), makeContext()).ok).toBe(true);
  });

  it("rejects an emoji Homer already has on that message, and a duplicate inside the plan", () => {
    const result = validatePlan(planOf(react(soupId, "💜"), react(mentionId, "🔥"), react(mentionId, "🔥")), makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(`action 1 (react): you already reacted 💜 on message ${soupId}`);
    expect(result.error).toContain(`action 3 (react): this plan already reacts 🔥 on message ${mentionId}`);
  });
});
