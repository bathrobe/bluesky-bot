// Three failed attempts in one window: tick marked done, Joe alerted once. Temp state file, fake alert.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readState, writeState } from "../state.ts";
import { checkSchedule } from "./schedule.ts";
import { recordScheduledAttempt, recordScheduledAttemptAndAlert } from "./scheduleFailures.ts";
import { at, groupSchedule, makeState } from "./scheduleTestHelpers.ts";

let temporaryFolder = "";
let statePath = "";
beforeEach(async () => {
  temporaryFolder = await mkdtemp(join(tmpdir(), "homer-schedule-"));
  statePath = join(temporaryFolder, "state.json");
});
afterEach(() => rm(temporaryFolder, { recursive: true, force: true }));

describe("three failures in a window", () => {
  it("heartbeat: alerts once, then waits for the next window", async () => {
    await writeState(makeState({ lastHeartbeatAt: "2026-11-14T12:00:00Z" }), statePath);
    const alerts: string[] = [];
    const sendAlert = async (text: string) => alerts.push(text);
    for (const minute of ["00", "01", "02"]) {
      await recordScheduledAttemptAndAlert({ trigger: "heartbeat", succeeded: false, now: at(`2026-11-14T17:${minute}:00Z`), sendAlert, statePath });
    }
    expect(alerts).toHaveLength(1);
    const state = await readState(statePath);
    expect(state.lastHeartbeatAt).toBe("2026-11-14T17:02:00.000Z");
    expect(state.failedAttemptsByTrigger).toEqual({});
    expect(checkSchedule(state, at("2026-11-14T17:03:00Z"), groupSchedule).heartbeatDue).toBe(false);
    expect(checkSchedule(state, at("2026-11-14T22:02:00Z"), groupSchedule).heartbeatDue).toBe(true);
  });

  it("gm: alerts once, and no gm today", async () => {
    await writeState(makeState({ gmMinuteToday: { date: "2026-11-14", minute: "07:30" } }), statePath);
    const alerts: string[] = [];
    for (const minute of ["30", "31", "32"]) {
      await recordScheduledAttemptAndAlert({ trigger: "gm", succeeded: false, now: at(`2026-11-14T12:${minute}:00Z`), sendAlert: async (text) => alerts.push(text), statePath });
    }
    expect(alerts).toHaveLength(1);
    const state = await readState(statePath);
    expect(state.lastGmDate).toBe("2026-11-14");
    expect(checkSchedule(state, at("2026-11-14T12:33:00Z"), groupSchedule).gmDue).toBe(false);
  });

  it("success resets the count; two failures alert nothing", () => {
    const now = at("2026-11-14T17:00:00Z");
    let state = makeState({ lastHeartbeatAt: "2026-11-14T12:00:00Z" });
    for (const succeeded of [false, false, true, false, false]) {
      const result = recordScheduledAttempt(state, "heartbeat", succeeded, now);
      expect(result.alertText).toBeNull();
      state = result.nextState;
    }
    expect(Object.values(state.failedAttemptsByTrigger)).toEqual([2]);
  });

  it("a count from an older window does not carry over", () => {
    const yesterdayCount = { "gm|2026-11-13": 2 };
    const result = recordScheduledAttempt(makeState({ failedAttemptsByTrigger: yesterdayCount }), "gm", false, at("2026-11-14T12:30:00Z"));
    expect(result.alertText).toBeNull();
    expect(result.nextState.failedAttemptsByTrigger).toEqual({ "gm|2026-11-14": 1 });
  });
});
