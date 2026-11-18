import { afterEach, describe, expect, it, vi } from "vitest";
import { config, GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { createDefaultState } from "../state.ts";
import { HOMER_DID, makeMessage } from "../transcript.fixtures.ts";
import { targetConvoId } from "./runDependencies.ts";
import { composeFirstUserMessage, runShared } from "./runShared.ts";

const plan = { reason: "the room is quiet", actions: [{ type: "react" as const, messageId: "m1", emoji: "👀" }] };
const loopRecord = { turns: [{ turnNumber: 1 }], rejectedPlans: [], tokens: { prompt: 10, completion: 2, total: 12 }, model: "fake-model" };

function makeFakes(overrides: Record<string, any> = {}) {
  const writtenLogs: any[] = [];
  const dependencies = {
    createSession: vi.fn(async () => ({ homerDid: HOMER_DID })),
    fetchShortHandleByDid: vi.fn(async () => ({ [HOMER_DID]: "homer" })),
    fetchRecentMessages: vi.fn(async () => [makeMessage({ id: "m1", text: "hello" })]),
    runToolLoop: vi.fn(async () => ({ ok: true, plan, ...loopRecord }) as any),
    readState: vi.fn(async () => createDefaultState()),
    updateState: vi.fn(async () => createDefaultState()),
    writeRunLog: vi.fn(async (runLog: any) => (writtenLogs.push(runLog), "logs/fake.json")),
    sendPlanAction: vi.fn(async () => ({ sent: true, messageId: "never" }) as any),
    ...overrides,
  };
  return { dependencies, writtenLogs };
}
const runDry = (dependencies: any) =>
  runShared({ runKind: "heartbeat", skillFile: "heartbeat.md", dryRun: true, buildRunNotes: () => "run notes: test", dependencies });

afterEach(() => {
  config.target = "dm";
  vi.restoreAllMocks();
});

describe("runShared, dry", () => {
  it("logs outcome dry with the exact first user message and leaves state alone", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { dependencies, writtenLogs } = makeFakes();
    const result = await runDry(dependencies);
    expect(result).toMatchObject({ outcome: "dry", plan, convoId: TEST_DM_CONVO_ID, logPath: "logs/fake.json" });
    expect(dependencies.updateState).not.toHaveBeenCalled();
    expect(dependencies.sendPlanAction).not.toHaveBeenCalled();
    const loopOptions = (dependencies.runToolLoop.mock.calls as any)[0][0];
    expect(loopOptions.messages[1].content).toBe(writtenLogs[0].firstUserMessage);
    expect(writtenLogs[0].firstUserMessage).toMatch(/\{m1\}[\s\S]*run notes: test\n- tengri playlist: empty\.$/);
    expect(loopOptions.planCheckContext).toMatchObject({ runKind: "heartbeat", knownMessageIds: ["m1"], homerDid: HOMER_DID });
    expect(writtenLogs[0]).toMatchObject({ outcome: "dry", reason: plan.reason, finalPlan: plan, sent: [], model: "fake-model", tokens: loopRecord.tokens });
  });

  it("makes no model call while paused", async () => {
    const pausedState = { ...createDefaultState(), paused: true };
    const { dependencies, writtenLogs } = makeFakes({ readState: vi.fn(async () => pausedState) });
    expect((await runDry(dependencies)).outcome).toBe("paused");
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.runToolLoop).not.toHaveBeenCalled();
    expect(writtenLogs).toHaveLength(0);
  });

  it("stops before the model call when paused arrives mid-run", async () => {
    const readState = vi.fn().mockResolvedValueOnce(createDefaultState()).mockResolvedValue({ ...createDefaultState(), paused: true });
    const { dependencies } = makeFakes({ readState });
    expect((await runDry(dependencies)).outcome).toBe("paused");
    expect(dependencies.runToolLoop).not.toHaveBeenCalled();
  });

  it("logs a failed loop as failed, with its error and rejected plans", async () => {
    const rejectedPlans = [{ plan: {}, error: "bad" }];
    const failedLoop = { ok: false, failureKind: "rejected-plans", error: "two plans in a row", ...loopRecord, rejectedPlans };
    const { dependencies, writtenLogs } = makeFakes({ runToolLoop: vi.fn(async () => failedLoop) });
    const result = await runDry(dependencies);
    expect(result).toMatchObject({ outcome: "failed", plan: null, error: "rejected-plans: two plans in a row" });
    expect(writtenLogs[0]).toMatchObject({ outcome: "failed", rejectedPlans });
  });

  it("builds the lookup tools from the run's session and target conversation", async () => {
    const { dependencies } = makeFakes();
    const buildLookupTools = vi.fn(() => ({}));
    await runShared({ runKind: "heartbeat", skillFile: "heartbeat.md", dryRun: true, buildRunNotes: () => "", dependencies, buildLookupTools });
    expect(buildLookupTools).toHaveBeenCalledWith({ session: { homerDid: HOMER_DID }, convoId: TEST_DM_CONVO_ID, shortHandleByDid: { [HOMER_DID]: "homer" }, messages: expect.any(Array) });
    expect((dependencies.runToolLoop.mock.calls as any)[0][0].lookupTools).toEqual({});
  });

  it("refuses the group before reading anything", async () => {
    const { dependencies } = makeFakes();
    config.target = "group";
    await expect(runDry(dependencies)).rejects.toThrow(`Refusing conversation ${GROUP_CONVO_ID}`);
    expect(dependencies.readState).not.toHaveBeenCalled();
    expect(dependencies.createSession).not.toHaveBeenCalled();
  });
});

describe("pieces", () => {
  it("targetConvoId maps dm to the test DM", () => expect(targetConvoId("dm")).toBe(TEST_DM_CONVO_ID));
  it("composeFirstUserMessage puts the catalog between transcript and notes", () => {
    expect(composeFirstUserMessage({ transcript: "T", runNotes: "N" })).toBe("T\n\nN");
    expect(composeFirstUserMessage({ transcript: "T", catalogText: "C", runNotes: "N" })).toBe("T\n\nC\n\nN");
  });
});
