// What a failed @-reply run does (runs/atReplyRetry.ts), through the real queue and run on fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOMER_DID } from "../transcript.fixtures.ts";
import { findMentionsLeftUnanswered } from "../triggers/mentionsCatchUp.ts";
import { MENTION_ID, postReply, queuedMention, replyTo } from "./atReply.fakes.ts";
import { makeHarness, settle } from "./atReplyQueue.fakes.ts";
import { createAtReplyRunReporter } from "./atReplyRetry.ts";

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("a failed @-reply run is not lost", () => {
  it("a failed run is tried again after 2 and 10 minutes and answered once", async () => {
    const harness = makeHarness({ modelReplies: [new Error("down"), new Error("down"), postReply(replyTo(MENTION_ID))] });
    harness.enqueueMention(queuedMention());
    await settle();
    expect([await harness.fireNextTimer(), await harness.fireNextTimer()]).toEqual([120_000, 600_000]);
    expect(harness.world.sentActions.map((action) => action.replyTo)).toEqual([MENTION_ID]);
    expect(harness.alerts).toEqual([]);
  });

  it("three failures: Joe is alerted, the @ is not marked skipped, and the next start's scan finds it again", async () => {
    const harness = makeHarness({ modelReplies: [new Error("down"), new Error("down"), new Error("down")] });
    harness.enqueueMention(queuedMention());
    await settle();
    await harness.fireNextTimer();
    await harness.fireNextTimer();
    expect(harness.alerts).toHaveLength(1);
    expect(harness.laterCalls).toEqual([]);
    expect(harness.world.savedState.skippedMentionIds).toEqual([]);
    const fetchRecent = async () => harness.world.history;
    const found = await findMentionsLeftUnanswered({ session: { homerDid: HOMER_DID }, skippedMentionIds: [], fetchRecent });
    expect(found.map((mention) => mention.messageId)).toEqual([MENTION_ID]);
  });

  it("a run that sent its reply and then failed is retried but never answers twice", async () => {
    const harness = makeHarness({ modelReplies: [postReply(replyTo(MENTION_ID)), postReply(replyTo(MENTION_ID))] });
    harness.world.dependencies.updateState.mockRejectedValueOnce(new Error("disk full"));
    harness.enqueueMention(queuedMention());
    await settle();
    await harness.fireNextTimer(); // the retry
    expect(harness.world.sentActions).toHaveLength(1);
    expect(harness.world.modelCalls).toHaveLength(1);
    expect(harness.lines.some((line) => line.includes("finished: dropped"))).toBe(true);
  });

  it("a run stopped by the off switch goes straight back in the queue and is not a failed try", async () => {
    const [enqueueMention, callLater, sendAlert] = [vi.fn(() => true), vi.fn(), vi.fn(async () => {})];
    const report = createAtReplyRunReporter({ enqueueMention, sendAlert, callLater, logLine: () => {} });
    const mention = queuedMention();
    await report({ kind: "atReply", mention, result: { outcome: "paused" }, error: null });
    expect(enqueueMention).toHaveBeenCalledWith(mention);
    await report({ kind: "heartbeat", mention: null, result: { outcome: "failed" }, error: null }); // not ours
    expect(callLater).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
