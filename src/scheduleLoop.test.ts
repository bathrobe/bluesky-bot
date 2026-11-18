import { describe, expect, it } from "vitest";
import { checkScheduleOnce, createScheduledRunReporter, runScheduleLoop, scheduledAttemptSucceeded } from "./scheduleLoop.ts";
import { createDefaultState } from "./state.ts";

const finishedHeartbeat = (result: any, error: any = null) => ({ kind: "heartbeat" as const, mention: null, result, error });

function makeFakeQueue(accepts = true) {
  const requested: string[] = [];
  let pumps = 0;
  const queue = {
    requestScheduledRun: (kind: "heartbeat" | "gm") => (requested.push(kind), accepts),
    pump: async () => void pumps++,
  };
  return { queue, requested, pumpCount: () => pumps };
}

describe("checkScheduleOnce", () => {
  const gmMinuteToday = { date: "2026-11-14", minute: "07:30" };
  const check = (due: { heartbeatDue: boolean; gmDue: boolean; gmMinuteChanged: boolean }, accepts = true) => {
    const fake = makeFakeQueue(accepts);
    const savedGmMinutes: any[] = [];
    const lines: string[] = [];
    const done = checkScheduleOnce({
      queue: fake.queue,
      readState: async () => createDefaultState(),
      saveGmMinuteToday: async (minute) => void savedGmMinutes.push(minute),
      checkSchedule: () => ({ ...due, gmMinuteToday }),
      logLine: (line) => lines.push(line),
    });
    return done.then(() => ({ ...fake, savedGmMinutes, lines }));
  };

  it("queues what is due, saves a new gm minute, and pumps the queue", async () => {
    const result = await check({ heartbeatDue: true, gmDue: true, gmMinuteChanged: true });
    expect(result.requested).toEqual(["heartbeat", "gm"]);
    expect(result.savedGmMinutes).toEqual([gmMinuteToday]);
    expect(result.pumpCount()).toBe(1);
    expect(result.lines).toHaveLength(2);
  });

  it("asks for nothing when nothing is due, and logs nothing when the queue refuses", async () => {
    const quiet = await check({ heartbeatDue: false, gmDue: false, gmMinuteChanged: false });
    expect([quiet.requested, quiet.savedGmMinutes]).toEqual([[], []]);
    const refused = await check({ heartbeatDue: true, gmDue: false, gmMinuteChanged: false }, false);
    expect(refused.lines).toEqual([]); // a heartbeat was already waiting or running
  });
});

describe("runScheduleLoop", () => {
  it("keeps checking every minute after a check throws", async () => {
    const sleeps: number[] = [];
    const lines: string[] = [];
    let checks = 0;
    await runScheduleLoop({
      checkOnce: async () => {
        if (++checks === 1) throw new Error("state.json unreadable");
      },
      checkSeconds: 60,
      sleep: async (seconds) => void sleeps.push(seconds),
      logLine: (line) => lines.push(line),
      shouldKeepRunning: () => checks < 3,
    });
    expect([checks, sleeps]).toEqual([3, [60, 60, 60]]);
    expect(lines[0]).toContain("schedule check failed");
  });
});

describe("reporting a finished scheduled run", () => {
  it("counts failed and thrown runs as failed attempts, posted and skipped as success, paused as neither", () => {
    expect(scheduledAttemptSucceeded(finishedHeartbeat({ outcome: "failed" }))).toBe(false);
    expect(scheduledAttemptSucceeded(finishedHeartbeat(null, new Error("boom")))).toBe(false);
    expect(scheduledAttemptSucceeded(finishedHeartbeat({ outcome: "posted" }))).toBe(true);
    expect(scheduledAttemptSucceeded(finishedHeartbeat({ outcome: "skipped" }))).toBe(true);
    expect(scheduledAttemptSucceeded(finishedHeartbeat({ outcome: "paused" }))).toBeNull();
  });

  it("records heartbeat and gm attempts, and nothing for paused or @-reply runs", async () => {
    const recorded: any[] = [];
    const recordAttempt = async (attempt: any) => (recorded.push([attempt.trigger, attempt.succeeded]), { alertText: null });
    const report = createScheduledRunReporter({ sendAlert: async () => {}, recordAttempt, logLine: () => {} });
    await report(finishedHeartbeat({ outcome: "failed" }));
    await report({ ...finishedHeartbeat({ outcome: "skipped" }), kind: "gm" });
    await report(finishedHeartbeat({ outcome: "paused" }));
    await report({ ...finishedHeartbeat(null, new Error("boom")), kind: "atReply" });
    expect(recorded).toEqual([["heartbeat", false], ["gm", true]]);
  });
});
