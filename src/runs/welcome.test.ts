// The welcome run on fakes: nobody new means no model call; a finished run marks everyone welcomed.
import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../state.ts";
import { HOMER_DID, JOE_DID, shortHandleByDid } from "../transcript.fixtures.ts";
import { runWelcome } from "./welcome.ts";

const NEW_DID = "did:plc:newcomerfixture";
const joinNow = () => ({
  $type: "chat.bsky.convo.defs#systemMessageView", id: "j1", rev: "r", sentAt: new Date(Date.now() - 60_000).toISOString(),
  data: { $type: "chat.bsky.convo.defs#systemMessageDataAddMember", member: { did: NEW_DID }, addedBy: { did: JOE_DID } },
});
const plan = { reason: "welcome", actions: [{ type: "text", text: "a verse\nrook, keeper of the rug" }], epithets: [{ member: "rook", epithet: "keeper of the rug" }] };

function makeWorld(messages: any[], welcomedDids: string[] = []) {
  const state = { ...createDefaultState(), welcomedDids };
  const dependencies: any = {
    createSession: async () => ({ homerDid: HOMER_DID }),
    readState: async () => state,
    updateState: async (change: any) => change(state),
    fetchShortHandleByDid: async () => ({ ...shortHandleByDid, [NEW_DID]: "rook" }),
    fetchRecentMessages: async () => messages,
    fetchProfiles: vi.fn(async () => ({ [NEW_DID]: { displayName: "Rook", description: "rug guy" } })),
    loadSendableMemes: async () => [],
    runToolLoop: vi.fn(async () => ({ ok: true, plan, turns: [], rejectedPlans: [], tokens: { prompt: 0, completion: 0, total: 0 } })),
    sendPlanAction: vi.fn(async () => ({ sent: true, messageId: "sent1" })),
    writeRunLog: async () => "logs/fake.json",
  };
  return { state, dependencies };
}

describe("runWelcome", () => {
  it("makes no model call when nobody new joined", async () => {
    const world = makeWorld([joinNow()], [NEW_DID]);
    expect(await runWelcome({ dryRun: false, dependencies: world.dependencies })).toMatchObject({ outcome: "nobody-new" });
    expect(world.dependencies.runToolLoop).not.toHaveBeenCalled();
  });

  it("sends the verse, marks the newcomer welcomed and keeps the epithet", async () => {
    const world = makeWorld([joinNow()]);
    const result: any = await runWelcome({ dryRun: false, dependencies: world.dependencies });
    expect(result.outcome).toBe("posted");
    expect(world.dependencies.runToolLoop.mock.calls[0][0].planCheckContext.newcomerNames).toEqual(["rook"]);
    expect(world.dependencies.runToolLoop.mock.calls[0][0].messages[1].content).toContain('bio: "rug guy"');
    expect(world.state.welcomedDids).toEqual([NEW_DID]);
    expect(world.state.epithetsByDid[NEW_DID].epithet).toBe("keeper of the rug");
  });

  it("refuses treatAsNewDids outside a dry run", async () => {
    await expect(runWelcome({ dryRun: false, treatAsNewDids: [NEW_DID] })).rejects.toThrow("dry runs only");
  });
});
