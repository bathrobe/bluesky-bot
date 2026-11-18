// Scheduler, ordinary days. Nov 14 2026 is EST (UTC-5): 06:30 ET = 11:30Z. Fixed clocks only.
import { describe, expect, it } from "vitest";
import { checkSchedule, heartbeatIntervalMinutes, isGmDue, isHeartbeatDue, keepOrPickGmMinuteToday } from "./schedule.ts";
import { at, dmTestSchedule, groupSchedule, makeState } from "./scheduleTestHelpers.ts";

const today = "2026-11-14";
const gmAt0742 = { date: today, minute: "07:42" };

describe("heartbeat window and interval", () => {
  it("06:30 is inside, 06:29 outside, 23:59 inside, midnight outside", () => {
    const state = makeState();
    expect(isHeartbeatDue(state, at("2026-11-14T11:30:00Z"), groupSchedule)).toBe(true);
    expect(isHeartbeatDue(state, at("2026-11-14T11:29:00Z"), groupSchedule)).toBe(false);
    expect(isHeartbeatDue(state, at("2026-11-15T04:59:00Z"), groupSchedule)).toBe(true);
    expect(isHeartbeatDue(state, at("2026-11-15T05:00:00Z"), groupSchedule)).toBe(false);
  });

  it("due 5 hours after the last heartbeat, not before", () => {
    const state = makeState({ lastHeartbeatAt: "2026-11-14T12:00:00Z" });
    expect(isHeartbeatDue(state, at("2026-11-14T16:59:00Z"), groupSchedule)).toBe(false);
    expect(isHeartbeatDue(state, at("2026-11-14T17:00:00Z"), groupSchedule)).toBe(true);
  });

  it("the short interval applies in the DM only", () => {
    expect(heartbeatIntervalMinutes(dmTestSchedule)).toBe(3);
    expect(heartbeatIntervalMinutes({ ...dmTestSchedule, target: "group" })).toBe(300);
    const state = makeState({ lastHeartbeatAt: "2026-11-14T15:00:00Z" });
    expect(isHeartbeatDue(state, at("2026-11-14T15:03:00Z"), dmTestSchedule)).toBe(true);
  });
});

describe("the one-hour gap between gm and heartbeat", () => {
  it("no heartbeat within an hour after a gm", () => {
    const state = makeState({ lastHeartbeatAt: "2026-11-14T02:00:00Z", lastGmAt: "2026-11-14T12:42:00Z", lastGmDate: today });
    expect(isHeartbeatDue(state, at("2026-11-14T13:41:00Z"), groupSchedule)).toBe(false);
    expect(isHeartbeatDue(state, at("2026-11-14T13:42:00Z"), groupSchedule)).toBe(true);
  });

  it("no gm within an hour after a heartbeat", () => {
    const state = makeState({ lastHeartbeatAt: "2026-11-14T11:30:00Z", gmMinuteToday: { date: today, minute: "07:00" } });
    expect(isGmDue(state, at("2026-11-14T12:29:00Z"), groupSchedule)).toBe(false);
    expect(isGmDue(state, at("2026-11-14T12:30:00Z"), groupSchedule)).toBe(true);
  });
});

describe("gm", () => {
  it("due from today's minute until 10:00, once a day", () => {
    const state = makeState({ gmMinuteToday: gmAt0742 });
    expect(isGmDue(state, at("2026-11-14T12:41:00Z"), groupSchedule)).toBe(false);
    expect(isGmDue(state, at("2026-11-14T12:42:00Z"), groupSchedule)).toBe(true);
    expect(isGmDue(state, at("2026-11-14T14:59:00Z"), groupSchedule)).toBe(true);
    expect(isGmDue(state, at("2026-11-14T15:00:00Z"), groupSchedule)).toBe(false);
    expect(isGmDue({ ...state, lastGmDate: today }, at("2026-11-14T13:00:00Z"), groupSchedule)).toBe(false);
  });

  it("a stale gm minute from yesterday is never due", () => {
    const state = makeState({ gmMinuteToday: { date: "2026-11-13", minute: "07:00" } });
    expect(isGmDue(state, at("2026-11-14T13:00:00Z"), groupSchedule)).toBe(false);
  });

  it("picks 07:00–09:00 once per ET day, and keeps it", () => {
    const now = at("2026-11-14T10:00:00Z");
    expect(keepOrPickGmMinuteToday(makeState(), now, groupSchedule, () => 0)).toEqual({ date: today, minute: "07:00" });
    expect(keepOrPickGmMinuteToday(makeState(), now, groupSchedule, () => 0.9999)).toEqual({ date: today, minute: "09:00" });
    const kept = keepOrPickGmMinuteToday(makeState({ gmMinuteToday: gmAt0742 }), now, groupSchedule, () => 0);
    expect(kept).toEqual(gmAt0742);
  });

  it("a minute picked late in the morning: due if before 10:00, not after", () => {
    const pickedAt0930 = checkSchedule(makeState(), at("2026-11-14T14:30:00Z"), groupSchedule, () => 0.25);
    expect(pickedAt0930.gmMinuteToday).toEqual({ date: today, minute: "07:30" });
    expect(pickedAt0930.gmMinuteChanged).toBe(true);
    expect(pickedAt0930.gmDue).toBe(true);
    expect(checkSchedule(makeState(), at("2026-11-14T15:30:00Z"), groupSchedule, () => 0.25).gmDue).toBe(false);
  });
});

describe("paused and missed ticks", () => {
  it("paused: nothing is due", () => {
    const state = makeState({ paused: true, gmMinuteToday: gmAt0742 });
    expect(checkSchedule(state, at("2026-11-14T13:00:00Z"), groupSchedule)).toMatchObject({ heartbeatDue: false, gmDue: false });
  });

  it("a wake after 14 hours yields one heartbeat and no gm", () => {
    const asleepSince = "2026-11-14T02:00:00Z"; // 9pm ET Nov 13, the last heartbeat
    const state = makeState({ lastHeartbeatAt: asleepSince, lastGmDate: "2026-11-13", gmMinuteToday: { date: "2026-11-13", minute: "08:00" } });
    const wake = at("2026-11-14T16:00:00Z"); // 11am ET
    expect(checkSchedule(state, wake, groupSchedule)).toMatchObject({ heartbeatDue: true, gmDue: false });
    const afterOneHeartbeat = makeState({ ...state, lastHeartbeatAt: wake.toISOString() });
    expect(checkSchedule(afterOneHeartbeat, at("2026-11-14T16:01:00Z"), groupSchedule).heartbeatDue).toBe(false);
  });
});
