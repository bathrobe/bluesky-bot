// Live-mode runs with every outside dependency faked: no network, nothing real is sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { createDefaultState } from "../state.ts";
import { HOMER_DID, makeMessage } from "../transcript.fixtures.ts";
import { runHeartbeat } from "./heartbeat.ts";

const reactAction = { type: "react" as const, messageId: "m1", emoji: "👀" };
const textAction = { type: "text" as const, text: "hello" };
const loopRecord = { turns: [], rejectedPlans: [], tokens: { prompt: 10, completion: 2, total: 12 }, model: "fake-model" };

function makeFakes(actions: any[], overrides: Record<string, any> = {}) {
  const writtenLogs: any[] = [];
  const savedState = createDefaultState();
  const plan = { reason: "testing", actions };
  const dependencies = {
    createSession: vi.fn(async () => ({ homerDid: HOMER_DID })),
    fetchShortHandleByDid: vi.fn(async () => ({ [HOMER_DID]: "homer" })),
    fetchRecentMessages: vi.fn(async () => [makeMessage({ id: "m1", text: "hello" })]),
    loadSendableMemes: vi.fn(async () => []),
    runToolLoop: vi.fn(async () => ({ ok: true, plan, ...loopRecord }) as any),
    readState: vi.fn(async () => createDefaultState()),
    updateState: vi.fn(async (changeState: any) => (changeState(savedState), savedState)),
    writeRunLog: vi.fn(async (runLog: any) => (writtenLogs.push(runLog), "logs/fake.json")),
    sendPlanAction: vi.fn(async (_context: any, _convoId: string, action: any) => ({ sent: true, messageId: action.messageId ?? "new1" }) as any),
    ...overrides,
  };
  return { dependencies, writtenLogs, savedState };
}
const runLive = (dependencies: any) => runHeartbeat({ dryRun: false, dependencies });

afterEach(() => vi.restoreAllMocks());

describe("runShared, live (heartbeat)", () => {
  it("posted: sends through the Sender seam, logs the ids, records lastHeartbeatAt", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { dependencies, writtenLogs, savedState } = makeFakes([reactAction, textAction]);
    const result = await runLive(dependencies);
    expect(result.outcome).toBe("posted");
    const [sendContext, convoId, firstAction] = dependencies.sendPlanAction.mock.calls[0];
    expect(convoId).toBe(TEST_DM_CONVO_ID);
    expect(firstAction).toEqual(reactAction);
    expect(sendContext.readState).toBe(dependencies.readState); // the Sender reads `paused` itself
    expect(writtenLogs[0]).toMatchObject({ outcome: "posted", error: null, conversationId: TEST_DM_CONVO_ID });
    expect(writtenLogs[0].sent).toEqual([{ action: reactAction, messageId: "m1" }, { action: textAction, messageId: "new1" }]);
    expect(Date.parse(savedState.lastHeartbeatAt!)).toBeGreaterThan(0);
  });

  it("skipped: an empty plan sends nothing but still records lastHeartbeatAt", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { dependencies, writtenLogs, savedState } = makeFakes([]);
    expect((await runLive(dependencies)).outcome).toBe("skipped");
    expect(dependencies.sendPlanAction).not.toHaveBeenCalled();
    expect(writtenLogs[0]).toMatchObject({ outcome: "skipped", sent: [] });
    expect(savedState.lastHeartbeatAt).not.toBeNull();
  });

  it("failed: when the first send errors, lastHeartbeatAt is left alone", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const sendPlanAction = vi.fn().mockRejectedValue(new Error("chat is down"));
    const { dependencies, writtenLogs, savedState } = makeFakes([reactAction, textAction], { sendPlanAction });
    const result = await runLive(dependencies);
    expect(result).toMatchObject({ outcome: "failed", error: expect.stringContaining("chat is down") });
    expect(sendPlanAction).toHaveBeenCalledTimes(1);
    expect(writtenLogs[0].sent).toEqual([{ action: reactAction, error: "chat is down" }]);
    expect(dependencies.updateState).not.toHaveBeenCalled();
    expect(savedState.lastHeartbeatAt).toBeNull();
  });

  it("failed: a model failure sends nothing and leaves lastHeartbeatAt alone", async () => {
    const runToolLoop = vi.fn(async () => ({ ok: false, failureKind: "step-cap", error: "no valid post", ...loopRecord }));
    const { dependencies, savedState } = makeFakes([reactAction], { runToolLoop });
    expect((await runLive(dependencies)).outcome).toBe("failed");
    expect(dependencies.sendPlanAction).not.toHaveBeenCalled();
    expect(savedState.lastHeartbeatAt).toBeNull();
  });

  it("posted with an error: a later send failure keeps what landed and records the tick", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const sendPlanAction = vi.fn().mockResolvedValueOnce({ sent: true, messageId: "m1" }).mockRejectedValueOnce(new Error("503"));
    const { dependencies, writtenLogs, savedState } = makeFakes([reactAction, textAction, textAction], { sendPlanAction });
    expect((await runLive(dependencies)).outcome).toBe("posted");
    expect(sendPlanAction).toHaveBeenCalledTimes(2);
    expect(writtenLogs[0].error).toContain("503");
    expect(savedState.lastHeartbeatAt).not.toBeNull();
  });
});
