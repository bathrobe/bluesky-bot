import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../state.ts";
import { HOMER_DID, JOE_DID, NOW_MS, makeDeleted, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { alreadySaidGmToday, buildMorningGmNotes, recordFinishedGm, runMorningGm } from "./morningGm.ts";

const OTHER_DID = "did:plc:otherfixture";
const joeSays = (id: string, sentAt: string) => makeMessage({ id, text: "x", sentAt });
const homerSays = (id: string, sentAt: string) => makeMessage({ id, text: "x", sentAt, sender: { did: HOMER_DID } });
const notesFor = (messages: any[]) => buildMorningGmNotes({ messages, nowMs: NOW_MS, homerDid: HOMER_DID, shortHandleByDid });

describe("buildMorningGmNotes", () => {
  it("gives the time, how long since anyone spoke, and recent activity from others", () => {
    const notes = notesFor([
      joeSays("old", "2026-11-14T06:00:00.000Z"), // 14h before NOW_MS (20:00Z): outside both windows
      makeMessage({ id: "o1", text: "x", sentAt: "2026-11-14T10:00:00.000Z", sender: { did: OTHER_DID } }),
      homerSays("h1", "2026-11-14T18:30:00.000Z"),
      joeSays("j1", "2026-11-14T19:00:00.000Z"),
      makeDeleted("gone", JOE_DID, "2026-11-14T19:30:00.000Z"),
    ]);
    expect(notes).toContain("run notes (morning gm):");
    expect(notes).toContain("- time: sat, 3:00 pm est (afternoon).");
    expect(notes).toContain("- last message in the chat: 1h ago, from joe.");
    expect(notes).toContain("- in the last 2 hours: 1 messages from others (1 people).");
    expect(notes).toContain("- in the last 12 hours: 2 messages from others (2 people).");
    expect(notes).not.toContain("nobody has spoken since your last post");
  });

  it("says when nobody has spoken since Homer, and when the chat is empty", () => {
    expect(notesFor([joeSays("j1", "2026-11-14T10:00:00.000Z"), homerSays("h1", "2026-11-14T11:00:00.000Z")])).toContain(
      "- nobody has spoken since your last post.",
    );
    expect(notesFor([])).toContain("- nobody has spoken in the last");
  });
});

describe("alreadySaidGmToday", () => {
  const morning = new Date("2026-11-14T13:00:00.000Z"); // 8am ET
  it("compares lastGmDate with today's Eastern date", () => {
    expect(alreadySaidGmToday({ lastGmDate: "2026-11-14" }, morning)).toBe(true);
    expect(alreadySaidGmToday({ lastGmDate: "2026-11-13" }, morning)).toBe(false);
    expect(alreadySaidGmToday({ lastGmDate: null }, morning)).toBe(false);
  });
  it("uses the Eastern day, not UTC: 11pm ET is still the same day", () => {
    expect(alreadySaidGmToday({ lastGmDate: "2026-11-14" }, new Date("2026-11-15T04:00:00.000Z"))).toBe(true);
  });
});

describe("recordFinishedGm", () => {
  it("records both the Eastern date and the exact time", () => {
    const state = createDefaultState();
    recordFinishedGm(state, "2026-11-15T03:30:00.000Z"); // 10:30pm ET on the 14th
    expect(state.lastGmDate).toBe("2026-11-14");
    expect(state.lastGmAt).toBe("2026-11-15T03:30:00.000Z");
  });
});

describe("runMorningGm (fakes, no network)", () => {
  afterEach(() => vi.restoreAllMocks());
  function fakes(actions: any[]) {
    const savedState = createDefaultState();
    const dependencies = {
      createSession: vi.fn(async () => ({ homerDid: HOMER_DID })),
      fetchShortHandleByDid: vi.fn(async () => ({ [HOMER_DID]: "homer" })),
      fetchRecentMessages: vi.fn(async () => [joeSays("m1", "2026-11-14T12:00:00.000Z")]),
      loadSendableMemes: vi.fn(async () => []),
      runToolLoop: vi.fn(async () => ({ ok: true, plan: { reason: "t", actions }, turns: [], rejectedPlans: [], tokens: {} }) as any),
      readState: vi.fn(async () => createDefaultState()),
      updateState: vi.fn(async (changeState: any) => (changeState(savedState), savedState)),
      writeRunLog: vi.fn(async () => "logs/fake.json"),
      sendPlanAction: vi.fn(async () => ({ sent: true, messageId: "new1" }) as any),
    };
    return { dependencies, savedState };
  }

  it("a live greeting records lastGmDate and lastGmAt, with no catalog and no lookups", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { dependencies, savedState } = fakes([{ type: "text", text: "gm" }]);
    expect((await runMorningGm({ dryRun: false, dependencies })).outcome).toBe("posted");
    const loopOptions = (dependencies.runToolLoop.mock.calls[0] as any[])[0];
    expect(loopOptions.lookupTools).toBeUndefined();
    expect(loopOptions.planCheckContext.runKind).toBe("gm");
    expect(dependencies.loadSendableMemes).not.toHaveBeenCalled();
    expect(savedState.lastGmDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(savedState.lastGmAt!)).toBeGreaterThan(0);
  });

  it("a deliberate skip also records today's gm; a dry run records nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const skip = fakes([]);
    expect((await runMorningGm({ dryRun: false, dependencies: skip.dependencies })).outcome).toBe("skipped");
    expect(skip.savedState.lastGmAt).not.toBeNull();
    const dry = fakes([{ type: "text", text: "gm" }]);
    expect((await runMorningGm({ dryRun: true, dependencies: dry.dependencies })).outcome).toBe("dry");
    expect(dry.dependencies.updateState).not.toHaveBeenCalled();
  });
});
