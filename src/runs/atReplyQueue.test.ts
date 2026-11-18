// Listener -> run queue -> @-reply run -> retry, end to end on fakes: no network, nothing real is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSendContext } from "../bluesky/send.ts.fakes.ts";
import { handleNewMessage } from "../handleNewMessage.ts";
import { HOMER_DID, JOE_DID, makeMessage } from "../transcript.fixtures.ts";
import { makeEvent, makeMentionFacet } from "../triggers/mentions.fixtures.ts";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { mentionMessage, postReply, replyTo } from "./atReply.fakes.ts";
import { makeHarness } from "./atReplyQueue.fakes.ts";

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("@-replies through the listener and the queue", () => {
  it("several missed @s run oldest first, each once; a replayed event queues nothing or is dropped unanswered", async () => {
    const [first, second, third] = ["01", "02", "03"].map((n) => mentionMessage(`3mention000${n}`, `2026-11-14T19:${n}:00.000Z`));
    const fromHomer = makeMessage({ id: "3homerself001", sender: { did: HOMER_DID }, facets: [makeMentionFacet(HOMER_DID)] });
    const history = [first, second, third];
    const modelReplies = history.map((message) => postReply(replyTo(message.id))); // a wrong order would be rejected by the plan check
    const harness = makeHarness({ history, modelReplies }, true);
    for (const message of [third, first, makeMessage({ id: "3plain0000001", text: "homer?" }), fromHomer, second]) await harness.handle(message);
    await harness.handle(first); // the same event again while it waits
    expect(harness.queue.describe().waitingMentionIds).toHaveLength(3); // paused: all three wait, none twice
    expect(harness.lines.at(-1)).toContain("already queued");

    harness.flags.paused = false; // `on`
    await harness.queue.pump();
    while (harness.laterCalls.length > 0) expect(await harness.fireNextTimer()).toBe(60_000);
    expect(harness.world.sentActions.map((action) => action.replyTo)).toEqual([first.id, second.id, third.id]);

    await harness.handle(first); // replayed after it was answered: taken, then dropped by the fresh-history check
    while (harness.laterCalls.length > 0) await harness.fireNextTimer();
    expect(harness.world.sentActions).toHaveLength(3);
    expect(harness.world.modelCalls).toHaveLength(3);
  });

  it("Joe's off is the off switch even with a mention in it: it never reaches the queue", async () => {
    const enqueueMention = vi.fn(() => true);
    const offEvent = makeEvent(makeMessage({ id: "3off000000001", text: "off", facets: [makeMentionFacet(HOMER_DID)] }), TEST_DM_CONVO_ID);
    const statePath = `${process.env.TMPDIR ?? "/tmp"}/homer-atreply-${process.pid}/state.json`;
    await handleNewMessage(offEvent, { homerDid: HOMER_DID, joeDid: JOE_DID, sendContext: makeFakeSendContext().context, statePath, enqueueMention, logLine: () => {} });
    expect(enqueueMention).not.toHaveBeenCalled();
  });
});
