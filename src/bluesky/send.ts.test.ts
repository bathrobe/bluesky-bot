// Tests for the Sender, with a fake agent: no network, nothing real is ever sent. Named send.ts.test.ts on
// purpose: it must name the chat write calls to fake them, and the item 12 grep skips `bluesky/send.ts*`.
import { describe, expect, it } from "vitest";
import { config, GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { makeFakeSendContext } from "./send.ts.fakes.ts";
import { addReaction, sendMemeEmbed, sendOperatorAlert, sendPlanAction, sendText, type SendContext } from "./send.ts";

const makeFakeContext = makeFakeSendContext;
const memePost = { uri: "at://did:plc:homerfixture/app.bsky.feed.post/3fakepost0001", cid: "bafyfakecid" };
const everySendTo = (context: SendContext, convoId: string) => [
  () => sendText(context, convoId, "hello"),
  () => addReaction(context, convoId, "target1", "🐎"),
  () => sendMemeEmbed(context, convoId, memePost),
  () => sendPlanAction(context, convoId, { type: "text", text: "hello" }),
  () => sendPlanAction(context, convoId, { type: "react", messageId: "target1", emoji: "🐎" }),
];

describe("send: allow list", () => {
  it("the allow list is the test DM only", () => expect(config.allowedConvoIds).toEqual([TEST_DM_CONVO_ID]));

  it("throws for 3myuetafuyt2i (the group) and the fake agent is never called", async () => {
    expect(GROUP_CONVO_ID).toBe("3myuetafuyt2i");
    const fake = makeFakeContext();
    for (const send of everySendTo(fake.context, "3myuetafuyt2i")) {
      await expect(send()).rejects.toThrow("Refusing to send to conversation 3myuetafuyt2i");
    }
    fake.expectNothingSent();
    expect(fake.readState).not.toHaveBeenCalled(); // refused before anything else
  });

  it("throws for any other conversation, even while paused", async () => {
    const fake = makeFakeContext(true);
    for (const send of everySendTo(fake.context, "someOtherConvo")) await expect(send()).rejects.toThrow(/not in config.allowedConvoIds/);
    fake.expectNothingSent();
  });
});
describe("send: paused", () => {
  it("sends nothing when paused", async () => {
    const fake = makeFakeContext(true);
    for (const send of everySendTo(fake.context, TEST_DM_CONVO_ID)) expect(await send()).toEqual({ sent: false, reason: "paused" });
    expect(await sendOperatorAlert(fake.context, "alert")).toEqual({ sent: false, reason: "paused" });
    fake.expectNothingSent();
  });

  it("reads paused at call time, not once", async () => {
    const fake = makeFakeContext();
    fake.readState.mockResolvedValueOnce({ paused: false }).mockResolvedValue({ paused: true });
    expect((await sendText(fake.context, TEST_DM_CONVO_ID, "first")).sent).toBe(true);
    expect((await sendText(fake.context, TEST_DM_CONVO_ID, "second")).sent).toBe(false);
    expect(fake.sendMessage).toHaveBeenCalledTimes(1);
  });
});
describe("send: request shapes (spike-notes.md > Chat shapes)", () => {
  it("sendText sends plain text, and a reply as replyTo: { messageId }", async () => {
    const fake = makeFakeContext();
    expect(await sendText(fake.context, TEST_DM_CONVO_ID, "hello")).toEqual({ sent: true, messageId: "newMessage1" });
    await sendText(fake.context, TEST_DM_CONVO_ID, "a reply", "parent1");
    expect(fake.sendMessage.mock.calls[0][0]).toEqual({ convoId: TEST_DM_CONVO_ID, message: { text: "hello" } });
    expect(fake.sendMessage.mock.calls[1][0]).toEqual({ convoId: TEST_DM_CONVO_ID, message: { text: "a reply", replyTo: { messageId: "parent1" } } });
  });

  it("addReaction sends { convoId, messageId, value } and returns the target id", async () => {
    const fake = makeFakeContext();
    expect(await addReaction(fake.context, TEST_DM_CONVO_ID, "target1", "🐎")).toEqual({ sent: true, messageId: "target1" });
    expect(fake.addReactionCall).toHaveBeenCalledWith({ convoId: TEST_DM_CONVO_ID, messageId: "target1", value: "🐎" });
  });

  it("sendMemeEmbed embeds the public post, with empty text when there is no caption", async () => {
    const fake = makeFakeContext();
    await sendMemeEmbed(fake.context, TEST_DM_CONVO_ID, memePost);
    const embed = { $type: "app.bsky.embed.record", record: memePost };
    expect(fake.sendMessage).toHaveBeenCalledWith({ convoId: TEST_DM_CONVO_ID, message: { text: "", embed } });
  });

  it("sendOperatorAlert always goes to the test DM", async () => {
    const fake = makeFakeContext();
    await sendOperatorAlert(fake.context, "three failed heartbeats");
    expect(fake.sendMessage).toHaveBeenCalledWith({ convoId: TEST_DM_CONVO_ID, message: { text: "three failed heartbeats" } });
  });

  it("sendPlanAction refuses a meme until a catalog lookup is passed (item 16), then embeds it", async () => {
    const fake = makeFakeContext();
    const memeAction = { type: "meme" as const, file: "cat.jpg", caption: "look", replyTo: "parent1" };
    await expect(sendPlanAction(fake.context, TEST_DM_CONVO_ID, memeAction)).rejects.toThrow(/no catalog post/);
    fake.expectNothingSent();
    await sendPlanAction(fake.context, TEST_DM_CONVO_ID, memeAction, () => memePost);
    expect(fake.sendMessage.mock.calls[0][0].message).toMatchObject({ text: "look", replyTo: { messageId: "parent1" } });
  });
});
