// The run queue (spec.md > Run queue): one run at a time, never overlapping. Order when several
// wait: heartbeat, gm, welcome, then @s oldest first, with 60s between two @-reply runs. Nothing is taken
// while paused: @s stay queued; a waiting heartbeat or gm is dropped (never made up later).
// The queue only decides WHEN. What a run does, and what a failed @ means, belongs to the run
// function and `onRunFinished` (an @ is removed when taken; item 25 may enqueue it again).
import { config } from "../config.ts";
import { describeError } from "../pollLoop.ts";
import { pickNextRun, type FinishedRun, type QueuedMention, type RunQueueKind, type RunQueueOptions, type ScheduledRunKind } from "./runQueuePick.ts";

export type { FinishedRun, QueuedMention, RunFunctions, RunQueueKind, RunQueueOptions, ScheduledRunKind } from "./runQueuePick.ts";

export type RunQueue = ReturnType<typeof createRunQueue>;

export function createRunQueue(options: RunQueueOptions) {
  const { runFunctions, isPaused, nowMs = Date.now, logLine = console.log } = options;
  const callLater = options.callLater ?? ((waitMs, callback) => void setTimeout(callback, waitMs));
  const secondsBetweenAtReplies = options.secondsBetweenAtReplies ?? config.caps.secondsBetweenAtReplies;
  const scheduledWaiting = { heartbeat: false, gm: false, welcome: false };
  let waitingMentions: QueuedMention[] = [];
  let runningKind: RunQueueKind | null = null;
  let runningMentionId: string | null = null;
  let lastAtReplyFinishedMs: number | null = null;
  let currentDrain: Promise<void> | null = null;
  let wakeUpPlanned = false;

  async function runOne(kind: RunQueueKind, mention: QueuedMention | null): Promise<void> {
    const finishedRun: FinishedRun = { kind, mention, result: null, error: null };
    runningKind = kind;
    runningMentionId = mention?.messageId ?? null;
    try {
      finishedRun.result = kind === "atReply" ? await runFunctions.atReply!(mention!) : await runFunctions[kind]!();
    } catch (error) {
      finishedRun.error = error;
      logLine(`run queue: the ${kind} run threw: ${describeError(error)}`);
    }
    if (kind === "atReply") lastAtReplyFinishedMs = nowMs();
    runningKind = runningMentionId = null;
    try {
      await options.onRunFinished?.(finishedRun);
    } catch (error) {
      logLine(`run queue: reporting the ${kind} run failed: ${describeError(error)}`);
    }
  }

  // Take runs one after another until nothing may run right now. Never throws.
  async function drain(): Promise<void> {
    try {
      while (true) {
        if (await isPaused()) return void (scheduledWaiting.heartbeat = scheduledWaiting.gm = scheduledWaiting.welcome = false);
        const waiting = { heartbeatWaiting: scheduledWaiting.heartbeat, gmWaiting: scheduledWaiting.gm, welcomeWaiting: scheduledWaiting.welcome, waitingMentions };
        const next = pickNextRun({ ...waiting, lastAtReplyFinishedMs, nowMs: nowMs(), secondsBetweenAtReplies });
        if (!next) return;
        if (next.kind === "wait") return planWakeUp(next.waitMs);
        if (next.kind === "atReply") waitingMentions = waitingMentions.filter((mention) => mention !== next.mention);
        else scheduledWaiting[next.kind] = false;
        await runOne(next.kind, next.mention);
      }
    } catch (error) {
      logLine(`run queue: stopped taking runs until the next pump: ${describeError(error)}`);
    } finally {
      currentDrain = null; // same tick as the last check above, so nothing queued can be missed
    }
  }

  function planWakeUp(waitMs: number): void {
    if (wakeUpPlanned) return;
    wakeUpPlanned = true;
    callLater(waitMs, () => {
      wakeUpPlanned = false;
      void pump();
    });
  }

  // Start taking runs if none is in progress. Safe to call any time; main also calls it after each
  // poll and each schedule check, which is what picks the queue up again after `on`.
  function pump(): Promise<void> {
    currentDrain ??= drain();
    return currentDrain;
  }

  return {
    pump,
    // False when that kind is not registered, or one is already waiting or running.
    requestScheduledRun(kind: ScheduledRunKind): boolean {
      if (!runFunctions[kind] || scheduledWaiting[kind] || runningKind === kind) return false;
      scheduledWaiting[kind] = true;
      void pump();
      return true;
    },
    // False when @-replies are not registered, or this @ is already waiting or being answered.
    enqueueMention(mention: QueuedMention): boolean {
      const alreadyQueued = waitingMentions.some((waitingMention) => waitingMention.messageId === mention.messageId);
      if (!runFunctions.atReply || alreadyQueued || runningMentionId === mention.messageId) return false;
      waitingMentions.push(mention);
      void pump();
      return true;
    },
    describe: () => ({ runningKind, heartbeatWaiting: scheduledWaiting.heartbeat, gmWaiting: scheduledWaiting.gm, waitingMentionIds: waitingMentions.map((mention) => mention.messageId) }),
  };
}
