// One reply per message: a heartbeat may not quote-reply something Homer already answered.
import { describe, expect, it } from "vitest";
import { messageIdsHomerRepliedTo } from "./repeatReplyRule.ts";
import { validatePlan } from "./validatePlan.ts";
import { fixtureMessages, HOMER_DID, makeContext, planOf, text } from "./validatePlanTestHelpers.ts";

const homerReply = { id: "3msg000000003", text: "hi", sender: { did: HOMER_DID }, replyTo: { id: "3msg000000002" }, sentAt: "2026-11-16T02:10:00.000Z", reactions: [] };
const messages = [...fixtureMessages, homerReply];
const answeredContext = (overrides = {}) => makeContext({ messages, knownMessageIds: messages.map((message) => message.id), ...overrides });

describe("validatePlan: one reply per message", () => {
  it("finds what Homer replied to, and can count only replies after a time", () => {
    expect(messageIdsHomerRepliedTo(messages, HOMER_DID)).toEqual(["3msg000000002"]);
    expect(messageIdsHomerRepliedTo(messages, HOMER_DID, Date.parse("2026-11-16T03:00:00.000Z"))).toEqual([]);
  });

  it("a heartbeat reply to an already answered message is rejected; a reply to another message passes", () => {
    const result = validatePlan(planOf(text("again", "3msg000000002")), answeredContext());
    expect(result.ok === false && result.error).toContain("you already replied to {3msg000000002}");
    expect(validatePlan(planOf(text("soup yes", "3msg000000001")), answeredContext()).ok).toBe(true);
  });

  it("two replies to one message in the same heartbeat plan are rejected", () => {
    const result = validatePlan(planOf(text("one", "3msg000000001"), text("two", "3msg000000001")), makeContext());
    expect(result.ok === false && result.error).toContain("action 2 (text): you already replied to {3msg000000001}");
  });

  it("an @-reply run is not checked by this rule", () => {
    const context = answeredContext({ runKind: "at-reply", mentioningMessageId: "3msg000000002" });
    expect(validatePlan(planOf(text("retry", "3msg000000002")), context).ok).toBe(true);
  });
});
