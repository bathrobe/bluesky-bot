// Scheduler (spec.md > Scheduler): is a heartbeat or a gm due right now? Pure functions of
// (state, now, schedule config). Nothing here remembers missed ticks, so nothing is ever made up:
// a wake after 14 hours sees one due heartbeat (if inside the window) and, past 10:00, no gm.
import { config } from "../config.ts";
import { easternDateKey } from "../easternDate.ts";
import type { HomerState } from "../state.ts";
import { clockTextToMinute, hoursBetween, localMinuteOfDay, minuteToClockText } from "./easternClock.ts";

export type ScheduleConfig = typeof config.schedule & { target?: "dm" | "group" };
type ScheduleState = Pick<HomerState, "paused" | "lastHeartbeatAt" | "lastGmAt" | "lastGmDate" | "gmMinuteToday">;
const defaultSchedule = (): ScheduleConfig => ({ ...config.schedule, target: config.target });

// The short test interval only applies in the DM; in the group it is always heartbeatEveryHours.
export function heartbeatIntervalMinutes(schedule: ScheduleConfig = defaultSchedule()): number {
  if (schedule.target === "group") return schedule.heartbeatEveryHours * 60;
  return schedule.heartbeatIntervalMinutes;
}

// 06:30 is inside; midnight (00:00) is outside: the window is [06:30, 24:00).
export function isInsideHeartbeatWindow(now: Date, schedule: ScheduleConfig = defaultSchedule()): boolean {
  const minute = localMinuteOfDay(now, schedule.timeZone);
  return minute >= clockTextToMinute(schedule.heartbeatWindowStart) && minute < clockTextToMinute(schedule.heartbeatWindowEnd);
}

export function isHeartbeatDue(state: ScheduleState, now: Date, schedule: ScheduleConfig = defaultSchedule()): boolean {
  if (state.paused) return false;
  if (!isInsideHeartbeatWindow(now, schedule)) return false;
  if (hoursBetween(state.lastHeartbeatAt, now) * 60 < heartbeatIntervalMinutes(schedule)) return false;
  return hoursBetween(state.lastGmAt, now) >= schedule.hoursBetweenGmAndHeartbeat;
}

// Keep today's gm minute, or pick a new one (07:00–09:00 inclusive) on the first check of an ET day.
export function keepOrPickGmMinuteToday(
  state: Pick<HomerState, "gmMinuteToday">,
  now: Date,
  schedule: ScheduleConfig = defaultSchedule(),
  random: () => number = Math.random,
): { date: string; minute: string } {
  const today = easternDateKey(now, schedule.timeZone);
  if (state.gmMinuteToday?.date === today) return state.gmMinuteToday;
  const earliest = clockTextToMinute(schedule.gmWindowStart);
  const latest = clockTextToMinute(schedule.gmWindowEnd);
  const pickedMinute = earliest + Math.floor(random() * (latest - earliest + 1));
  return { date: today, minute: minuteToClockText(Math.min(pickedMinute, latest)) };
}

// Needs today's gm minute in state.gmMinuteToday; a missing or stale one means "not due".
export function isGmDue(state: ScheduleState, now: Date, schedule: ScheduleConfig = defaultSchedule()): boolean {
  if (state.paused) return false;
  const today = easternDateKey(now, schedule.timeZone);
  if (state.lastGmDate === today) return false;
  if (state.gmMinuteToday?.date !== today) return false;
  const minute = localMinuteOfDay(now, schedule.timeZone);
  if (minute < clockTextToMinute(state.gmMinuteToday.minute)) return false;
  if (minute >= clockTextToMinute(schedule.gmLatest)) return false;
  return hoursBetween(state.lastHeartbeatAt, now) >= schedule.hoursBetweenGmAndHeartbeat;
}

// What item 20 calls every minute. If gmMinuteToday changed, the caller saves it to state.json.
export function checkSchedule(
  state: ScheduleState,
  now: Date,
  schedule: ScheduleConfig = defaultSchedule(),
  random: () => number = Math.random,
) {
  const gmMinuteToday = keepOrPickGmMinuteToday(state, now, schedule, random);
  const stateWithGmMinute = { ...state, gmMinuteToday };
  return {
    heartbeatDue: isHeartbeatDue(stateWithGmMinute, now, schedule),
    gmDue: isGmDue(stateWithGmMinute, now, schedule),
    gmMinuteToday,
    gmMinuteChanged: gmMinuteToday !== state.gmMinuteToday,
  };
}
