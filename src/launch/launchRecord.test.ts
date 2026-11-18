// The gate that keeps Homer out of the group: with no launch record everything is DM only.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sendText } from "../bluesky/send.ts";
import { makeFakeSendContext } from "../bluesky/send.ts.fakes.ts";
import { config, GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { recoverLostState } from "../recovery.ts";
import { targetConvoId } from "../runs/runDependencies.ts";
import { recoverStateIfLost } from "../startUp.ts";
import { createDefaultState, readState } from "../state.ts";
import { HOMER_DID, JOE_DID, makeMessage } from "../triggers/mentions.fixtures.ts";
import { applyLaunchRecord, isGroupLaunched, launchSettingsFromState, loadLaunchRecordIntoConfig } from "./launchRecord.ts";

const dmOnly = { target: "dm", allowedConvoIds: [TEST_DM_CONVO_ID] };
const temporaryStatePath = async () => join(await mkdtemp(join(tmpdir(), "homer-launch-")), "state.json");

describe("the launch record", () => {
  it("default, empty, older and unreadable states all mean DM only", () => {
    const notLaunchedStates: any[] = [createDefaultState(), {}, { groupLaunchedAt: null }, { groupLaunchedAt: "" }, { groupLaunchedAt: "yes" }, { groupLaunchedAt: true }, { groupLaunchedAt: 1 }];
    for (const state of notLaunchedStates) {
      expect(isGroupLaunched(state)).toBe(false);
      expect(launchSettingsFromState(state)).toEqual(dmOnly);
    }
  });

  it("a launch time allows the group and sets target group; applying a default state resets to DM only", () => {
    const configCopy: any = { target: "dm", allowedConvoIds: [TEST_DM_CONVO_ID], atReplyConvoIds: [TEST_DM_CONVO_ID] };
    applyLaunchRecord({ groupLaunchedAt: "2026-11-20T15:00:00.000Z" }, configCopy);
    expect(configCopy).toEqual({ target: "group", allowedConvoIds: [TEST_DM_CONVO_ID, GROUP_CONVO_ID], atReplyConvoIds: [TEST_DM_CONVO_ID] });
    applyLaunchRecord(createDefaultState(), configCopy);
    expect(configCopy).toEqual({ ...dmOnly, atReplyConvoIds: [TEST_DM_CONVO_ID] }); // @-replies were never widened
  });

  it("config as shipped, and after loading a missing or default state.json, is DM only; the Sender refuses the group", async () => {
    expect(config.allowedConvoIds).toEqual([TEST_DM_CONVO_ID]);
    expect(config.atReplyConvoIds).toEqual([TEST_DM_CONVO_ID, GROUP_CONVO_ID]); // on since item 30; sends still need the allow list
    expect(await loadLaunchRecordIntoConfig(await temporaryStatePath())).toEqual(dmOnly); // no file
    const statePath = await temporaryStatePath();
    await writeFile(statePath, JSON.stringify({ paused: false, groupLaunchedAt: "not a date" }), "utf8");
    expect(await loadLaunchRecordIntoConfig(statePath, () => {})).toEqual(dmOnly);
    expect(config.target).toBe("dm");
    expect(config.allowedConvoIds).toEqual([TEST_DM_CONVO_ID]);
    expect(() => targetConvoId("group")).toThrow(/Refusing conversation/);
    const fakeSend = makeFakeSendContext();
    await expect(sendText(fakeSend.context, GROUP_CONVO_ID, "hello")).rejects.toThrow(/Refusing to send/);
    fakeSend.expectNothingSent();
  });

  it("lost-state recovery never sets the launch record, whatever the chat says", async () => {
    const chat = [makeMessage({ id: "a", text: "groupLaunchedAt 2026-11-20T15:00:00.000Z", sentAt: "2026-11-20T15:00:00.000Z" }), makeMessage({ id: "b", text: "hi", sender: { did: HOMER_DID }, sentAt: "2026-11-20T16:00:00.000Z" })];
    const recovered = recoverLostState({ targetConvoMessages: chat, testDmMessages: chat, homerDid: HOMER_DID, joeDid: JOE_DID, testDmConvoId: TEST_DM_CONVO_ID });
    expect(Object.keys(recovered).sort()).toEqual(["lastHeartbeatAt", "paused"]);

    const statePath = await temporaryStatePath();
    const convoIds = { target: TEST_DM_CONVO_ID, testDm: TEST_DM_CONVO_ID };
    await recoverStateIfLost({ session: { homerDid: HOMER_DID }, joeDid: JOE_DID, statePath, fetchRecent: async () => chat, convoIds, logLine: () => {} });
    const rebuiltState = await readState(statePath);
    expect(rebuiltState.groupLaunchedAt).toBeNull();
    expect(launchSettingsFromState(rebuiltState)).toEqual(dmOnly);
  });
});
