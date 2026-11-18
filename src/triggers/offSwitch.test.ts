// Off switch on fixture events, with a temp state.json and a fake chat agent: nothing real is read or sent.
import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NewMessageEvent } from "../bluesky/poll.ts";
import { makeFakeSendContext } from "../bluesky/send.ts.fakes.ts";
import { sendText } from "../bluesky/send.ts";
import { GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { handleNewMessage } from "../handleNewMessage.ts";
import { readState, updateState } from "../state.ts";
import { handleOffSwitch, OFF_CONFIRMATION, ON_CONFIRMATION, readOffSwitchCommand } from "./offSwitch.ts";

const JOE_DID = "did:plc:joefixture";
const HOMER_DID = "did:plc:homerfixture";

function makeEvent(text: string, options: { senderDid?: string; convoId?: string } = {}): NewMessageEvent {
  const message = { $type: "chat.bsky.convo.defs#messageView", id: "msg1", text, sender: { did: options.senderDid ?? JOE_DID } };
  return { convoId: options.convoId ?? TEST_DM_CONVO_ID, rev: "rev1", message, relatedProfiles: [] };
}

// A temp state.json, and a fake Sender whose `paused` check reads that same file.
async function makeHarness() {
  const statePath = join(await mkdtemp(join(tmpdir(), "homer-offswitch-")), "state.json");
  const fake = makeFakeSendContext();
  const sendContext = { ...fake.context, readState: () => readState(statePath) };
  const context = { joeDid: JOE_DID, testDmConvoId: TEST_DM_CONVO_ID, sendContext, statePath };
  return { statePath, fake, sendContext, context, sentTexts: () => fake.sentMessages().map((request) => request.message.text) };
}

describe("offSwitch: which messages count", () => {
  const command = (event: NewMessageEvent) => readOffSwitchCommand(event, JOE_DID, TEST_DM_CONVO_ID);
  it("Joe's OFF / off / On in the DM count, any case, surrounding whitespace ok", () => {
    expect(command(makeEvent("OFF"))).toBe("off");
    expect(command(makeEvent("  off\n"))).toBe("off");
    expect(command(makeEvent("On"))).toBe("on");
  });
  it("'off please', 'of f', an empty message and a missing text do not", () => {
    for (const text of ["off please", "of f", "turn off", "", undefined as any]) expect(command(makeEvent(text))).toBeNull();
  });
  it("off from another DID does not (Homer included)", () => {
    expect(command(makeEvent("off", { senderDid: "did:plc:someoneelse" }))).toBeNull();
    expect(command(makeEvent("off", { senderDid: HOMER_DID }))).toBeNull();
  });
  it("off in another conversation does not", () => {
    expect(command(makeEvent("off", { convoId: GROUP_CONVO_ID }))).toBeNull();
    expect(command(makeEvent("off", { convoId: "someOtherConvo" }))).toBeNull();
  });
  it("an unknown Joe DID matches nobody", () => expect(readOffSwitchCommand(makeEvent("off"), "", TEST_DM_CONVO_ID)).toBeNull());
});

describe("offSwitch: handler", () => {
  it("Joe's OFF pauses, and the confirmation goes out even though paused is now true", async () => {
    const harness = await makeHarness();
    expect(await handleOffSwitch(makeEvent("OFF"), harness.context)).toBe("off");
    expect((await readState(harness.statePath)).paused).toBe(true);
    expect(harness.fake.sentMessages()).toEqual([{ convoId: TEST_DM_CONVO_ID, message: { text: OFF_CONFIRMATION } }]);
    // ...while every ordinary send now refuses
    expect(await sendText(harness.sendContext, TEST_DM_CONVO_ID, "hello")).toEqual({ sent: false, reason: "paused" });
    expect(harness.sentTexts()).toEqual([OFF_CONFIRMATION]);
  });

  it("on resumes and confirms", async () => {
    const harness = await makeHarness();
    await updateState((state) => (state.paused = true), harness.statePath);
    expect(await handleOffSwitch(makeEvent("on"), harness.context)).toBe("on");
    expect((await readState(harness.statePath)).paused).toBe(false);
    expect(harness.sentTexts()).toEqual([ON_CONFIRMATION]);
  });

  it("'off please', someone else's off, and off elsewhere change nothing and send nothing", async () => {
    const harness = await makeHarness();
    const notCommands = [makeEvent("off please"), makeEvent("off", { senderDid: "did:plc:x" }), makeEvent("off", { convoId: GROUP_CONVO_ID })];
    for (const event of notCommands) expect(await handleOffSwitch(event, harness.context)).toBeNull();
    expect((await readState(harness.statePath)).paused).toBe(false);
    harness.fake.expectNothingSent();
  });

  it("handleNewMessage runs the off switch and stops there", async () => {
    const harness = await makeHarness();
    const loggedLines: string[] = [];
    const handleContext = { homerDid: HOMER_DID, ...harness.context, logLine: (line: string) => loggedLines.push(line) };
    await handleNewMessage(makeEvent("off"), handleContext);
    expect((await readState(harness.statePath)).paused).toBe(true);
    expect(loggedLines.at(-1)).toMatch(/^off switch: off/);
    expect(loggedLines.join("\n")).not.toContain(OFF_CONFIRMATION);
  });
});
