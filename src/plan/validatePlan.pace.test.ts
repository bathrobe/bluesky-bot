// Heartbeat pacing: reactions only in a quiet room, and no gm outside the gm run.
import { describe, expect, it } from "vitest";
import { validatePlan } from "./validatePlan.ts";
import { HOMER_DID, JOE_DID, makeContext, planOf, react, text } from "./validatePlanTestHelpers.ts";

const from = (did: string, id: string, body = "x") => ({ id, text: body, sender: { did }, reactions: [] });
const quietRoom = [from(JOE_DID, "j1"), from(HOMER_DID, "h1"), from(JOE_DID, "j2"), from(JOE_DID, "j3", "is homer asleep")];
const busyRoom = [from(HOMER_DID, "h1"), ...["j1", "j2", "j3", "j4"].map((id) => from(JOE_DID, id))];
const contextFor = (messages: any[], overrides = {}) =>
  makeContext({ messages, knownMessageIds: messages.map((message) => message.id), heartbeatMinOtherMessages: 4, ...overrides });

describe("validatePlan: quiet room", () => {
  it("rejects a text when too few people have spoken since Homer's last message", () => {
    const result = validatePlan(planOf(text("a thought")), contextFor(quietRoom));
    expect(result.ok === false && result.error).toContain("only 2 messages from other people since your last message (it takes 4)");
  });

  it("passes reactions, a reply to someone who said his name, and any message once the room has moved", () => {
    expect(validatePlan(planOf(react("j2", "🐎")), contextFor(quietRoom)).ok).toBe(true);
    expect(validatePlan(planOf(text("awake", "j3")), contextFor(quietRoom)).ok).toBe(true);
    expect(validatePlan(planOf(text("a thought")), contextFor(busyRoom)).ok).toBe(true);
  });

  it("does not apply to @-reply runs", () => {
    const context = contextFor(quietRoom, { runKind: "at-reply", mentioningMessageId: "j2" });
    expect(validatePlan(planOf(text("hello", "j2")), context).ok).toBe(true);
  });
});

describe("validatePlan: gm belongs to the gm run", () => {
  it("rejects a heartbeat text that opens with gm, and passes other words", () => {
    const result = validatePlan(planOf(text("gm. the steppe is up")), contextFor(busyRoom));
    expect(result.ok === false && result.error).toContain("the morning gm is sent by its own run");
    expect(validatePlan(planOf(text("gmail is down again")), contextFor(busyRoom)).ok).toBe(true);
  });

  it("the gm run may still say gm", () => {
    expect(validatePlan(planOf(text("gm")), contextFor(quietRoom, { runKind: "gm" })).ok).toBe(true);
  });
});
