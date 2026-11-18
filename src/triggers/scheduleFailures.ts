// Failed scheduled runs (spec.md > Scheduler): three failed attempts in one window mark the tick
// done and alert Joe once. Counts live in state.failedAttemptsByTrigger under "<trigger>|<window>"
// keys, so a count from an old window never carries into a new one.
//   heartbeat window: one due tick, i.e. the same lastHeartbeatAt on the same ET day
//   gm window:        the ET day
import { config } from "../config.ts";
import { easternDateKey } from "../easternDate.ts";
import { updateState, type HomerState } from "../state.ts";

export type ScheduledTrigger = "heartbeat" | "gm";
type FailureState = Pick<HomerState, "failedAttemptsByTrigger" | "lastHeartbeatAt" | "lastGmDate">;

export function failureWindowKey(state: FailureState, trigger: ScheduledTrigger, now: Date, timeZone = config.schedule.timeZone): string {
  const today = easternDateKey(now, timeZone);
  if (trigger === "gm") return `gm|${today}`;
  return `heartbeat|${state.lastHeartbeatAt ?? "never"}|${today}`;
}

function countsWithoutTrigger(counts: Record<string, number>, trigger: ScheduledTrigger): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([key]) => !key.startsWith(`${trigger}|`) && key !== trigger));
}

// Pure. Success clears the count (the run itself records lastHeartbeatAt / lastGmDate).
// The third failure marks the tick done and returns the alert text for Joe.
export function recordScheduledAttempt<State extends FailureState>(
  state: State,
  trigger: ScheduledTrigger,
  succeeded: boolean,
  now: Date,
  failedAttemptsPerWindow = config.schedule.failedAttemptsPerWindow,
): { nextState: State; alertText: string | null } {
  const otherCounts = countsWithoutTrigger(state.failedAttemptsByTrigger ?? {}, trigger);
  if (succeeded) return { nextState: { ...state, failedAttemptsByTrigger: otherCounts }, alertText: null };

  const windowKey = failureWindowKey(state, trigger, now);
  const failedCount = (state.failedAttemptsByTrigger?.[windowKey] ?? 0) + 1;
  if (failedCount < failedAttemptsPerWindow) {
    return { nextState: { ...state, failedAttemptsByTrigger: { ...otherCounts, [windowKey]: failedCount } }, alertText: null };
  }
  const markedDone =
    trigger === "heartbeat"
      ? { lastHeartbeatAt: now.toISOString() } // as if it ran: wait for the next window
      : { lastGmDate: easternDateKey(now, config.schedule.timeZone) }; // no gm today
  const alertText = `homer: the ${trigger} failed ${failedCount} times in a row; skipping it until the next window.`;
  return { nextState: { ...state, ...markedDone, failedAttemptsByTrigger: otherCounts }, alertText };
}

// What item 20 calls after each scheduled attempt. `sendAlert` is injected; live, it is
// (text) => sendOperatorAlert(sendContext, text, now), which also holds alerts to one per ET day.
export async function recordScheduledAttemptAndAlert(options: {
  trigger: ScheduledTrigger;
  succeeded: boolean;
  now?: Date;
  sendAlert: (text: string) => Promise<unknown>;
  statePath?: string;
}): Promise<{ alertText: string | null }> {
  const now = options.now ?? new Date();
  let alertText: string | null = null;
  await updateState((state) => {
    const result = recordScheduledAttempt(state, options.trigger, options.succeeded, now);
    Object.assign(state, result.nextState);
    alertText = result.alertText;
  }, options.statePath);
  if (alertText) await options.sendAlert(alertText); // state first: a failed alert can't undo "done"
  return { alertText };
}
