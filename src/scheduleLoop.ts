// The every-minute side of main.ts: ask the scheduler what is due, hand it to the run queue, and
// report each finished scheduled run to the failure counter (spec.md > Scheduler, > Run queue).
// It only awaits state.json, never a run, so a long run cannot hold up the next check.
import { describeError } from "./pollLoop.ts";
import type { FinishedRun, RunQueue } from "./runs/runQueue.ts";
import { readState, updateState, type HomerState } from "./state.ts";
import { checkSchedule } from "./triggers/schedule.ts";
import { recordScheduledAttemptAndAlert } from "./triggers/scheduleFailures.ts";

export type ScheduleCheckOptions = {
  queue: Pick<RunQueue, "requestScheduledRun" | "pump">;
  now?: () => Date;
  readState?: () => Promise<HomerState>;
  saveGmMinuteToday?: (gmMinuteToday: { date: string; minute: string }) => Promise<unknown>;
  checkSchedule?: typeof checkSchedule;
  logLine?: (line: string) => void;
};

// One check. The queue refuses a second heartbeat (or gm) while one is waiting or running.
export async function checkScheduleOnce(options: ScheduleCheckOptions): Promise<void> {
  const { queue, logLine = console.log } = options;
  const now = (options.now ?? (() => new Date()))();
  const saveGmMinuteToday =
    options.saveGmMinuteToday ?? ((gmMinuteToday) => updateState((state) => (state.gmMinuteToday = gmMinuteToday)));
  const state = await (options.readState ?? readState)();
  const due = (options.checkSchedule ?? checkSchedule)(state, now);
  if (due.gmMinuteChanged) await saveGmMinuteToday(due.gmMinuteToday);
  if (due.heartbeatDue && queue.requestScheduledRun("heartbeat")) logLine(`${now.toISOString()} heartbeat due: queued`);
  if (due.gmDue && queue.requestScheduledRun("gm")) logLine(`${now.toISOString()} gm due: queued`);
  void queue.pump(); // also picks up @s left waiting while paused
}

export type ScheduleLoopOptions = {
  checkOnce: () => Promise<void>;
  checkSeconds: number;
  sleep: (seconds: number) => Promise<void>;
  logLine?: (line: string) => void;
  shouldKeepRunning?: () => boolean; // tests stop the loop; main runs forever
};

// Check, wait a minute, check again. A failed check is logged and tried again next minute.
export async function runScheduleLoop(options: ScheduleLoopOptions): Promise<void> {
  const { checkOnce, checkSeconds, sleep, logLine = console.log, shouldKeepRunning = () => true } = options;
  while (shouldKeepRunning()) {
    try {
      await checkOnce();
    } catch (error) {
      logLine(`schedule check failed: ${describeError(error)}; next check in ${checkSeconds}s`);
    }
    await sleep(checkSeconds);
  }
}

// true = a finished run (posted or a deliberate skip); false = a failed attempt (outcome "failed",
// or the run function threw); null = neither (paused, dry): the failure count is left alone.
export function scheduledAttemptSucceeded(finishedRun: FinishedRun): boolean | null {
  if (finishedRun.error) return false;
  const outcome = (finishedRun.result as any)?.outcome;
  if (outcome === "failed") return false;
  if (outcome === "posted" || outcome === "skipped") return true;
  return null;
}

// The queue's onRunFinished for heartbeat and gm. @-reply runs are not scheduled; item 25 handles them.
export function createScheduledRunReporter(options: {
  sendAlert: (text: string) => Promise<unknown>; // live: sendOperatorAlert, test DM only, one per ET day
  recordAttempt?: typeof recordScheduledAttemptAndAlert;
  logLine?: (line: string) => void;
}) {
  const { sendAlert, recordAttempt = recordScheduledAttemptAndAlert, logLine = console.log } = options;
  return async function reportScheduledRun(finishedRun: FinishedRun): Promise<void> {
    if (finishedRun.kind === "atReply") return;
    const result = finishedRun.result as any;
    const outcome = finishedRun.error ? "threw" : (result?.outcome ?? "unknown");
    logLine(`${new Date().toISOString()} ${finishedRun.kind} run finished: ${outcome}${result?.logPath ? ` (${result.logPath})` : ""}`);
    const succeeded = scheduledAttemptSucceeded(finishedRun);
    if (succeeded === null || finishedRun.kind === "welcome") return; // a welcome is logged, never counted or alerted
    const { alertText } = await recordAttempt({ trigger: finishedRun.kind, succeeded, sendAlert });
    if (alertText) logLine(`${finishedRun.kind}: three failed attempts; tick marked done, alert sent to the test DM`);
  };
}
