// Live heartbeat with a meme action, every outside dependency faked: nothing real is sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { createDefaultState } from "../state.ts";
import { HOMER_DID, makeMessage } from "../transcript.fixtures.ts";
import { runHeartbeat } from "./heartbeat.ts";

const soupMeme = { file: "soup.jpg", description: "a bowl of soup", goodFor: "soup talk", post: "p1", uri: "at://did:plc:x/app.bsky.feed.post/1", cid: "bafysoup" };
const horseMeme = { file: "horse.jpg", description: "a horse", goodFor: "horse talk", post: "p2", uri: "at://did:plc:x/app.bsky.feed.post/2", cid: "bafyhorse" };
const memeAction = { type: "meme" as const, file: "soup.jpg", caption: "soup time" };
const loopRecord = { turns: [], rejectedPlans: [], tokens: { prompt: 10, completion: 2, total: 12 }, model: "fake-model" };

function makeFakes(sendPlanAction: any, startingState = createDefaultState()) {
  const writtenLogs: any[] = [];
  const savedState = structuredClone(startingState);
  const dependencies = {
    createSession: vi.fn(async () => ({ homerDid: HOMER_DID })),
    fetchShortHandleByDid: vi.fn(async () => ({ [HOMER_DID]: "homer" })),
    fetchRecentMessages: vi.fn(async () => [makeMessage({ id: "m1", text: "soup?" })]),
    loadSendableMemes: vi.fn(async () => [soupMeme, horseMeme]),
    runToolLoop: vi.fn(async () => ({ ok: true, plan: { reason: "soup bit", actions: [memeAction] }, ...loopRecord }) as any),
    readState: vi.fn(async () => structuredClone(startingState)),
    updateState: vi.fn(async (changeState: any) => (changeState(savedState), savedState)),
    writeRunLog: vi.fn(async (runLog: any) => (writtenLogs.push(runLog), "logs/fake.json")),
    sendPlanAction,
  };
  return { dependencies, writtenLogs, savedState };
}

afterEach(() => vi.restoreAllMocks());

describe("runShared, live meme drop", () => {
  it("shows the tagged catalog, gives the plan check meme usage, sends via findMemePost and records usage", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const usedState = { ...createDefaultState(), memeLastUsed: { [TEST_DM_CONVO_ID]: { "horse.jpg": "2026-11-01T00:00:00.000Z" } } };
    const sendPlanAction = vi.fn(async () => ({ sent: true, messageId: "meme1" }));
    const { dependencies, writtenLogs, savedState } = makeFakes(sendPlanAction, usedState);
    expect((await runHeartbeat({ dryRun: false, dependencies })).outcome).toBe("posted");

    const firstUserMessage = writtenLogs[0].firstUserMessage;
    expect(firstUserMessage).toContain("meme catalog");
    expect(firstUserMessage).toContain("soup.jpg [fresh] for: soup talk");
    expect(firstUserMessage).toContain("horse.jpg [spent]");
    const loopOptions = (dependencies.runToolLoop.mock.calls as any)[0][0];
    expect(loopOptions.messages[1].content).toBe(firstUserMessage);
    expect(loopOptions.planCheckContext.memeUsage.sendableFiles).toEqual(["soup.jpg", "horse.jpg"]);

    const [, convoId, action, findMemePost] = (sendPlanAction.mock.calls as any)[0];
    expect([convoId, action]).toEqual([TEST_DM_CONVO_ID, memeAction]);
    expect(findMemePost("soup.jpg")).toEqual({ uri: soupMeme.uri, cid: "bafysoup" });
    expect(findMemePost("nope.jpg")).toBeUndefined();
    expect(writtenLogs[0].sent).toEqual([{ action: memeAction, messageId: "meme1" }]);
    expect(Date.parse(savedState.memeLastUsed[TEST_DM_CONVO_ID]["soup.jpg"])).toBeGreaterThan(Date.now() - 60_000);
    expect(savedState.memeLastUsed[TEST_DM_CONVO_ID]["horse.jpg"]).toBe("2026-11-01T00:00:00.000Z");
    expect(savedState.lastOverrideAtByConvo).toEqual({});
  });

  it("a failed meme send records nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const sendPlanAction = vi.fn().mockRejectedValue(new Error("chat is down"));
    const { dependencies, writtenLogs, savedState } = makeFakes(sendPlanAction);
    expect((await runHeartbeat({ dryRun: false, dependencies })).outcome).toBe("failed");
    expect(writtenLogs[0].sent).toEqual([{ action: memeAction, error: "chat is down" }]);
    expect(dependencies.updateState).not.toHaveBeenCalled();
    expect(savedState.memeLastUsed).toEqual({});
  });

  it("a dry run shows the catalog but records nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const sendPlanAction = vi.fn();
    const { dependencies, writtenLogs } = makeFakes(sendPlanAction);
    expect((await runHeartbeat({ dryRun: true, dependencies })).outcome).toBe("dry");
    expect(writtenLogs[0].firstUserMessage).toContain("soup.jpg [fresh]");
    expect(sendPlanAction).not.toHaveBeenCalled();
    expect(dependencies.updateState).not.toHaveBeenCalled();
  });
});
