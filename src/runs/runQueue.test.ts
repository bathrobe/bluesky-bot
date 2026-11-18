import { describe, expect, it } from "vitest";
import { createRunQueue } from "./runQueue.ts";
import { makeQueue, mention, settle } from "./runQueue.fakes.ts";

describe("run queue", () => {
  it("runs heartbeat, then gm, then @s oldest first, 60s apart, and never two at once", async () => {
    const { queue, events, world, wakeUps, release, starts } = makeQueue({ held: ["first"] });
    queue.enqueueMention(mention("first", "00:00"));
    await settle(); // "first" is now running and held
    queue.enqueueMention(mention("newer", "05:00"));
    queue.enqueueMention(mention("older", "03:00"));
    expect(queue.requestScheduledRun("gm")).toBe(true);
    expect(queue.requestScheduledRun("heartbeat")).toBe(true);
    expect(queue.requestScheduledRun("heartbeat")).toBe(false); // one is already waiting
    expect(queue.enqueueMention(mention("older", "03:00"))).toBe(false); // the same @ is queued once
    await settle();
    expect(starts()).toEqual(["first"]); // nothing else starts while a run is in progress

    release.first();
    await settle();
    expect(starts()).toEqual(["first", "heartbeat", "gm"]); // the @s wait: "first" ended under 60s ago
    expect(wakeUps.map((wakeUp) => wakeUp.waitMs)).toEqual([60_000]);

    world.nowMs += 59_000;
    wakeUps[0].callback();
    await settle();
    expect(starts()).toEqual(["first", "heartbeat", "gm"]); // 59s: still too soon
    for (const wakeUpIndex of [1, 2]) {
      world.nowMs += 60_000;
      wakeUps[wakeUpIndex].callback();
      await settle();
    }
    expect(starts()).toEqual(["first", "heartbeat", "gm", "older", "newer"]);
    // No overlap: every start is followed by its own end before the next start.
    events.forEach((event, index) => expect(event.startsWith(index % 2 === 0 ? "start" : "end")).toBe(true));
  });

  it("answers an @ that arrived during a heartbeat as soon as it finishes; no second heartbeat while one runs", async () => {
    const { queue, release, starts, wakeUps } = makeQueue({ held: ["heartbeat"] });
    queue.requestScheduledRun("heartbeat");
    await settle();
    expect(queue.requestScheduledRun("heartbeat")).toBe(false); // one is running
    queue.enqueueMention(mention("during", "00:00"));
    release.heartbeat();
    await settle();
    expect(starts()).toEqual(["heartbeat", "during"]);
    expect(wakeUps).toEqual([]); // no added delay
  });

  it("takes nothing while paused: @s stay queued, a due heartbeat is dropped and not made up", async () => {
    const { queue, world, starts } = makeQueue();
    world.paused = true;
    queue.enqueueMention(mention("waiting", "00:00"));
    queue.requestScheduledRun("heartbeat");
    await settle();
    expect(starts()).toEqual([]);
    expect(queue.describe()).toMatchObject({ heartbeatWaiting: false, waitingMentionIds: ["waiting"] });
    world.paused = false;
    await queue.pump();
    expect(starts()).toEqual(["waiting"]); // the @ runs; the heartbeat is gone
  });

  it("keeps going after a run throws, and reports the error", async () => {
    const { queue, finished, lines, starts } = makeQueue({ throwing: ["heartbeat"] });
    queue.requestScheduledRun("heartbeat");
    queue.requestScheduledRun("gm");
    await queue.pump();
    expect(starts()).toEqual(["heartbeat", "gm"]); // the queue still takes work
    expect(finished.map((finishedRun) => [finishedRun.kind, Boolean(finishedRun.error)])).toEqual([["heartbeat", true], ["gm", false]]);
    expect(lines[0]).toContain("heartbeat run threw");
  });

  it("queues nothing for a kind with no run function (gm and atReply before items 22 and 25)", async () => {
    const queue = createRunQueue({ runFunctions: { heartbeat: async () => "ok" }, isPaused: async () => false });
    expect(queue.requestScheduledRun("gm")).toBe(false);
    expect(queue.enqueueMention(mention("unanswered", "00:00"))).toBe(false);
  });
});
