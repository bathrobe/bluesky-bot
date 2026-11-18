// Shared fixtures for the scheduler tests: a fresh state, the real schedule config, fixed clocks.
import { config } from "../config.ts";
import { createDefaultState, type HomerState } from "../state.ts";
import type { ScheduleConfig } from "./schedule.ts";

export const groupSchedule: ScheduleConfig = { ...config.schedule, target: "group", heartbeatEveryHours: 5 }; // pinned so the tests do not move with config
export const dmTestSchedule: ScheduleConfig = { ...config.schedule, target: "dm", heartbeatEveryHours: 5, heartbeatIntervalMinutes: 3 };

export function makeState(fields: Partial<HomerState> = {}): HomerState {
  return { ...createDefaultState(), ...fields };
}

export const at = (isoUtc: string) => new Date(isoUtc);
