// The mention trigger and the already-answered check, on fixtures only. Nothing is read or sent.
import { describe, expect, it } from "vitest";
import { config, GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { createRunQueue } from "../runs/runQueue.ts";
import { findNameSaidMessages } from "../runs/heartbeatNoteParts.ts";
import { findUnansweredMentions, isMentionAnswered, isMentionOfHomer, readMentionTrigger } from "./mentions.ts";
import { HOMER_DID, JOE_DID, OTHER_DID, makeEvent, makeMentionFacet, makeMentionMessage, makeMessage } from "./mentions.fixtures.ts";

const realMention = makeMentionMessage("3mention00001", HOMER_DID, { sentAt: "2026-11-14T19:10:00.000Z" });
const trigger = (message: any, convoId = TEST_DM_CONVO_ID) => readMentionTrigger(makeEvent(message, convoId), HOMER_DID);

describe("mentions: the trigger", () => {
  it("@-replies are on in the test DM and the group (item 30)", () => {
    expect(config.atReplyConvoIds).toEqual([TEST_DM_CONVO_ID, GROUP_CONVO_ID]);
  });
  it("a facet with Homer's DID queues, once", async () => {
    const mention = trigger(realMention);
    expect(mention).toEqual({ messageId: "3mention00001", sentAt: "2026-11-14T19:10:00.000Z", convoId: TEST_DM_CONVO_ID, senderDid: JOE_DID });
    const queue = createRunQueue({ runFunctions: { atReply: async () => "posted" }, isPaused: async () => true, logLine: () => {} });
    expect(queue.enqueueMention(mention!)).toBe(true);
    expect(queue.enqueueMention(trigger(realMention)!)).toBe(false); // the same event replayed
    expect(queue.describe().waitingMentionIds).toEqual(["3mention00001"]);
  });
  it("a mention later in the text, next to a link facet, still queues", () => {
    const linkFacet = { $type: "app.bsky.richtext.facet", index: { byteStart: 0, byteEnd: 4 }, features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }] };
    expect(trigger(makeMessage({ id: "m2", text: "look @winedark.ink", facets: [linkFacet, makeMentionFacet(HOMER_DID, 5, 18)] }))).not.toBeNull();
  });
  it("'homer' as plain text does not (the heartbeat picks it up instead)", () => {
    const plainName = makeMessage({ id: "m3", text: "homer what do you think, @winedark.ink", sentAt: "2026-11-14T19:20:00.000Z" });
    expect(trigger(plainName)).toBeNull();
    expect(findNameSaidMessages([plainName], 0, HOMER_DID)).toEqual([plainName]);
  });
  it("a facet for another DID does not", () => {
    expect(trigger(makeMentionMessage("m4", OTHER_DID))).toBeNull();
    expect(trigger(makeMessage({ id: "m5", facets: [{ ...makeMentionFacet(HOMER_DID), features: [{ $type: "app.bsky.richtext.facet#link", did: HOMER_DID }] }] }))).toBeNull();
  });
  it("Homer's own message does not", () => {
    expect(trigger(makeMentionMessage("m6", HOMER_DID, { sender: { did: HOMER_DID } }))).toBeNull();
  });
  it("a conversation not in atReplyConvoIds does not", () => {
    expect(trigger(realMention, "3someotherdm")).toBeNull();
    expect(isMentionOfHomer(realMention, GROUP_CONVO_ID, HOMER_DID, [TEST_DM_CONVO_ID])).toBe(false);
    expect(trigger(realMention, GROUP_CONVO_ID)?.messageId).toBe("3mention00001"); // item 30's switch is on
  });
  it("a deleted message and a message with no facets do not", () => {
    expect(trigger({ $type: "chat.bsky.convo.defs#deletedMessageView", id: "m7", sender: { did: JOE_DID }, sentAt: "2026-11-14T19:00:00.000Z" })).toBeNull();
    expect(trigger(makeMessage({ id: "m8", text: "hello" }))).toBeNull();
  });
});

describe("mentions: already answered", () => {
  const homerReply = makeMessage({ id: "3reply0000001", text: "no", sender: { did: HOMER_DID }, sentAt: "2026-11-14T19:11:00.000Z", replyTo: realMention });
  const joeReply = makeMessage({ id: "3reply0000002", text: "hello?", sentAt: "2026-11-14T19:12:00.000Z", replyTo: realMention });
  const homerElsewhere = makeMessage({ id: "3reply0000003", text: "soup", sender: { did: HOMER_DID }, sentAt: "2026-11-14T19:13:00.000Z" });

  it("an @ nobody answered is open", () => {
    expect(isMentionAnswered(realMention.id, [realMention, joeReply, homerElsewhere], HOMER_DID, [])).toBe(false);
  });
  it("already-replied drops: a Homer message whose replyTo is the mention", () => {
    expect(isMentionAnswered(realMention.id, [realMention, homerReply], HOMER_DID, [])).toBe(true);
  });
  it("already-skipped drops: the ID is in skippedMentionIds", () => {
    expect(isMentionAnswered(realMention.id, [realMention], HOMER_DID, ["3other", realMention.id])).toBe(true);
  });
  it("someone else's reply to the @, or Homer's reply to a different message, does not count", () => {
    const replyToOther = makeMessage({ id: "r4", sender: { did: HOMER_DID }, replyTo: joeReply });
    expect(isMentionAnswered(realMention.id, [realMention, joeReply, replyToOther], HOMER_DID, [])).toBe(false);
  });
  it("findUnansweredMentions: only open @s, oldest first", () => {
    const olderMention = makeMentionMessage("3mention00000", HOMER_DID, { sentAt: "2026-11-14T18:00:00.000Z" });
    const answeredMention = makeMentionMessage("3mention00002", HOMER_DID, { sentAt: "2026-11-14T19:30:00.000Z" });
    const skippedMention = makeMentionMessage("3mention00003", HOMER_DID, { sentAt: "2026-11-14T19:40:00.000Z" });
    const replyToAnswered = makeMessage({ id: "r5", sender: { did: HOMER_DID }, sentAt: "2026-11-14T19:31:00.000Z", replyTo: answeredMention });
    const history = [realMention, olderMention, answeredMention, replyToAnswered, skippedMention, makeMentionMessage("x", OTHER_DID)];
    const unanswered = findUnansweredMentions(history, TEST_DM_CONVO_ID, HOMER_DID, [skippedMention.id]);
    expect(unanswered.map((mention) => mention.messageId)).toEqual(["3mention00000", "3mention00001"]);
    expect(findUnansweredMentions(history, GROUP_CONVO_ID, HOMER_DID, [], [TEST_DM_CONVO_ID])).toEqual([]);
  });
});
