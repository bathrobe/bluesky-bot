// The @-reply run on a fake chat and a scripted model: no network, nothing real is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { HOMER_DID, makeDeleted, makeMessage, JOE_DID, NOW_MS } from "../transcript.fixtures.ts";
import { runAtReply } from "./atReply.ts";
import { MENTION_ID, makeAtReplyWorld, mentionMessage, postReply, queuedMention, replyTo, type FakeWorldSettings } from "./atReply.fakes.ts";

const minutesBeforeNow = (minutes: number) => new Date(NOW_MS - minutes * 60_000).toISOString();
const answeredTimes = (count: number) => ({ atReplyTimesByConvo: { [TEST_DM_CONVO_ID]: Array.from({ length: count }, (_, index) => minutesBeforeNow(index + 1)) } });
function start(settings: FakeWorldSettings = {}, dryRun = false) {
  const world = makeAtReplyWorld(settings);
  const run = () => runAtReply(queuedMention(), { dryRun, dependencies: world.dependencies, nowMs: () => NOW_MS });
  return { world, run };
}

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("runAtReply", () => {
  it("the reply carries replyTo = the @ (a plan without it is rejected first), and an answered time is recorded", async () => {
    const { world, run } = start({ modelReplies: [postReply({ type: "text", text: "no quote" }), postReply(replyTo(MENTION_ID))] });
    expect(await run()).toMatchObject({ outcome: "posted", mentionMessageId: MENTION_ID, convoId: TEST_DM_CONVO_ID });
    expect(world.sentActions).toEqual([{ convoId: TEST_DM_CONVO_ID, type: "text", text: "hello back", replyTo: MENTION_ID }]);
    expect(world.modelCalls[1].messages.at(-1).content).toContain(`must have replyTo "${MENTION_ID}"`); // the rejection
    expect(world.savedState.atReplyTimesByConvo[TEST_DM_CONVO_ID]).toHaveLength(1);
    expect(world.savedState.skippedMentionIds).toEqual([]);
    expect(world.firstUserMessage()).toContain(`"@winedark.ink hello" {${MENTION_ID}}`);
    expect(world.modelCalls[0].tools.map((tool: any) => tool.function.name)).toEqual(["post", "search_chat", "search_bluesky", "bluesky_user_posts", "read_link"]);
    expect(world.dependencies.loadSendableMemes).toHaveBeenCalled(); // the catalog is part of an @-reply
    expect(world.dependencies.createSession).toHaveBeenCalledTimes(1); // one login for the check and the run
  });

  it("a deliberate skip (empty plan) records the ID, counts nothing toward the budget, and is never run again", async () => {
    const { world, run } = start({ modelReplies: [postReply()] });
    expect((await run()).outcome).toBe("skipped");
    expect(world.savedState).toMatchObject({ skippedMentionIds: [MENTION_ID], atReplyTimesByConvo: {} });
    expect((await run()).outcome).toBe("dropped");
    expect(world.modelCalls).toHaveLength(1);
  });

  it("a reactions-only plan is recorded as skipped too, since no reply marks the @ as answered", async () => {
    const { world, run } = start({ modelReplies: [postReply({ type: "react", messageId: MENTION_ID, emoji: "💜" })] });
    expect((await run()).outcome).toBe("posted");
    expect(world.savedState).toMatchObject({ skippedMentionIds: [MENTION_ID], atReplyTimesByConvo: {} });
  });

  it("an already-answered @ and a deleted @ are dropped with no model call and no state write", async () => {
    const homerReply = makeMessage({ id: "3homerreply01", sender: { did: HOMER_DID }, replyTo: { id: MENTION_ID } });
    for (const history of [[mentionMessage(), homerReply], [makeDeleted(MENTION_ID, JOE_DID, "2026-11-14T19:00:00.000Z")], []]) {
      const { world, run } = start({ history });
      expect((await run()).outcome).toBe("dropped");
      expect(world.modelCalls).toHaveLength(0);
      expect(world.dependencies.updateState).not.toHaveBeenCalled();
    }
  });

  it("budget skip: no model call and the ID is recorded; brush-off: the run notes say keep it to one line", async () => {
    const skipped = start({ state: answeredTimes(5) });
    expect((await skipped.run()).outcome).toBe("budget-skipped");
    expect(skipped.world.modelCalls).toHaveLength(0);
    expect(skipped.world.savedState.skippedMentionIds).toEqual([MENTION_ID]);

    const brushOff = start({ state: answeredTimes(4), modelReplies: [postReply(replyTo(MENTION_ID, "insert another quarter"))] });
    expect(await brushOff.run()).toMatchObject({ outcome: "posted", detail: "brush-off" });
    expect(brushOff.world.firstUserMessage()).toContain("- brush-off: you already answered 4 @s here in the last 15 minutes. keep this one to one line");
    const plain = start({ modelReplies: [postReply(replyTo(MENTION_ID))] });
    await plain.run();
    expect(plain.world.firstUserMessage()).not.toContain("brush-off");
  });

  it("a failed run writes nothing, so it can be tried again; once answered it is never answered twice", async () => {
    const { world, run } = start({ modelReplies: [new Error("gateway down"), postReply(replyTo(MENTION_ID))] });
    expect((await run()).outcome).toBe("failed");
    expect(world.dependencies.updateState).not.toHaveBeenCalled();
    expect((await run()).outcome).toBe("posted");
    expect((await run()).outcome).toBe("dropped"); // fresh history now holds Homer's reply
    expect(world.sentActions).toHaveLength(1);
    expect(world.modelCalls).toHaveLength(2);
  });

  it("an @ older than the transcript is shown in the notes and its ID still passes the plan check", async () => {
    const newerMessage = makeMessage({ id: "3newer0000001", text: "later chatter" });
    const { world, run } = start({ transcriptMessages: [newerMessage], modelReplies: [postReply(replyTo(MENTION_ID))] });
    expect((await run()).outcome).toBe("posted");
    expect(world.firstUserMessage()).toContain("older than the transcript above");
    expect(world.sentActions[0].replyTo).toBe(MENTION_ID);
  });

  it("dry: the model is called, nothing is sent, no state is written (budget skip included); paused: nothing at all", async () => {
    const dry = start({ modelReplies: [postReply(replyTo(MENTION_ID))] }, true);
    expect((await dry.run()).outcome).toBe("dry");
    await start({ state: answeredTimes(5) }, true).run();
    expect(dry.world.sentActions).toEqual([]);
    expect(dry.world.dependencies.updateState).not.toHaveBeenCalled();
    const paused = start({ state: { paused: true } });
    expect((await paused.run()).outcome).toBe("paused");
    expect(paused.world.dependencies.createSession).not.toHaveBeenCalled();
  });
});
