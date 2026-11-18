// One cited bluesky post per message, in every run kind.
import { describe, expect, it } from "vitest";
import { validatePlan } from "./validatePlan.ts";
import { makeContext, planOf, text } from "./validatePlanTestHelpers.ts";

const firstPost = "https://bsky.app/profile/someone.bsky.social/post/3fakepost0001";
const secondPost = "https://bsky.app/profile/other.bsky.social/post/3fakepost0002";

describe("validatePlan: one post link per message", () => {
  it("passes one post link, and a post link next to an ordinary link", () => {
    expect(validatePlan(planOf(text(`look ${firstPost}`)), makeContext()).ok).toBe(true);
    expect(validatePlan(planOf(text(`${firstPost} and https://example.com`)), makeContext()).ok).toBe(true);
  });

  it("rejects two post links in one text, in a heartbeat and in an @-reply", () => {
    const twoLinks = text(`both\n${firstPost}\n${secondPost}`, "3msg000000002");
    const contexts = [makeContext(), makeContext({ runKind: "at-reply", mentioningMessageId: "3msg000000002" })];
    for (const context of contexts) {
      const result = validatePlan(planOf(twoLinks), context);
      expect(result.ok === false && result.error).toContain("2 bluesky post links in one message");
    }
  });

  it("two heartbeat messages may each cite one post", () => {
    expect(validatePlan(planOf(text(firstPost), text(secondPost)), makeContext()).ok).toBe(true);
  });
});
