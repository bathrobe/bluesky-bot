// Scheduler on the two 2026 DST change days in America/New_York.
// Spring forward Mar 8 (02:00 EST → 03:00 EDT, UTC-4 after). Fall back Nov 1 (02:00 EDT → 01:00 EST, UTC-5 after).
import { describe, expect, it } from "vitest";
import { isGmDue, isHeartbeatDue, keepOrPickGmMinuteToday } from "./schedule.ts";
import { at, groupSchedule, makeState } from "./scheduleTestHelpers.ts";

describe("spring forward, 2026-03-08", () => {
  it("the window opens at 06:30 EDT (10:30Z)", () => {
    expect(isHeartbeatDue(makeState(), at("2026-03-08T10:29:00Z"), groupSchedule)).toBe(false);
    expect(isHeartbeatDue(makeState(), at("2026-03-08T10:30:00Z"), groupSchedule)).toBe(true);
  });

  it("5 hours means 5 real hours across the jump", () => {
    const state = makeState({ lastHeartbeatAt: "2026-03-08T06:30:00Z" }); // 01:30 EST
    expect(isHeartbeatDue(state, at("2026-03-08T10:30:00Z"), groupSchedule)).toBe(false); // 06:30 EDT, 4 real hours
    expect(isHeartbeatDue(state, at("2026-03-08T11:30:00Z"), groupSchedule)).toBe(true);
  });

  it("gm minute 07:42 EDT is 11:42Z; picked for the right ET day", () => {
    const state = makeState({ gmMinuteToday: keepOrPickGmMinuteToday(makeState(), at("2026-03-08T06:00:00Z"), groupSchedule, () => 0.35) });
    expect(state.gmMinuteToday).toEqual({ date: "2026-03-08", minute: "07:42" });
    expect(isGmDue(state, at("2026-03-08T11:41:00Z"), groupSchedule)).toBe(false);
    expect(isGmDue(state, at("2026-03-08T11:42:00Z"), groupSchedule)).toBe(true);
    expect(isGmDue(state, at("2026-03-08T14:00:00Z"), groupSchedule)).toBe(false); // 10:00 EDT
  });
});

describe("fall back, 2026-11-01", () => {
  it("the window opens at 06:30 EST (11:30Z); the repeated 1am hour is outside", () => {
    expect(isHeartbeatDue(makeState(), at("2026-11-01T05:30:00Z"), groupSchedule)).toBe(false); // 01:30 EDT
    expect(isHeartbeatDue(makeState(), at("2026-11-01T06:30:00Z"), groupSchedule)).toBe(false); // 01:30 EST
    expect(isHeartbeatDue(makeState(), at("2026-11-01T11:29:00Z"), groupSchedule)).toBe(false);
    expect(isHeartbeatDue(makeState(), at("2026-11-01T11:30:00Z"), groupSchedule)).toBe(true);
  });

  it("midnight that night (05:00Z) closes the window", () => {
    expect(isHeartbeatDue(makeState(), at("2026-11-02T04:59:00Z"), groupSchedule)).toBe(true);
    expect(isHeartbeatDue(makeState(), at("2026-11-02T05:00:00Z"), groupSchedule)).toBe(false);
  });

  it("5 hours means 5 real hours across the repeat", () => {
    const state = makeState({ lastHeartbeatAt: "2026-11-01T04:00:00Z" }); // 00:00 EDT
    expect(isHeartbeatDue(state, at("2026-11-01T08:59:00Z"), { ...groupSchedule, heartbeatWindowStart: "00:00" })).toBe(false);
    expect(isHeartbeatDue(state, at("2026-11-01T09:00:00Z"), { ...groupSchedule, heartbeatWindowStart: "00:00" })).toBe(true); // 04:00 EST
  });

  it("gm minute 07:42 EST is 12:42Z; 10:00 EST is 15:00Z", () => {
    const state = makeState({ gmMinuteToday: { date: "2026-11-01", minute: "07:42" } });
    expect(isGmDue(state, at("2026-11-01T12:41:00Z"), groupSchedule)).toBe(false);
    expect(isGmDue(state, at("2026-11-01T12:42:00Z"), groupSchedule)).toBe(true);
    expect(isGmDue(state, at("2026-11-01T15:00:00Z"), groupSchedule)).toBe(false);
  });
});
