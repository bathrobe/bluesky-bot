// Types for the run queue and the pure rule for what runs next. See spec.md > Run queue.
export type RunQueueKind = "heartbeat" | "gm" | "welcome" | "atReply";
export type ScheduledRunKind = "heartbeat" | "gm" | "welcome"; // welcome: asked for by a join, not the clock

// One @ waiting for an answer. Item 24 fills this from the mentioning message; extra fields ride along.
export type QueuedMention = { messageId: string; sentAt: string; [extraField: string]: any };

// One slot per kind. A kind with no function is "not registered": asking for it queues nothing.
export type RunFunctions = {
  heartbeat?: () => Promise<unknown>;
  gm?: () => Promise<unknown>; // runs/morningGm.ts
  welcome?: () => Promise<unknown>; // runs/welcome.ts
  atReply?: (mention: QueuedMention) => Promise<unknown>; // item 25
};

export type FinishedRun = {
  kind: RunQueueKind;
  mention: QueuedMention | null; // set for atReply
  result: unknown; // what the run function returned; null if it threw
  error: unknown; // what it threw; null if it returned
};

export type RunQueueOptions = {
  runFunctions: RunFunctions; // heartbeat and gm now; atReply (item 25) is added here
  isPaused: () => Promise<boolean>; // live: reads state.json
  onRunFinished?: (finishedRun: FinishedRun) => Promise<unknown> | unknown;
  nowMs?: () => number;
  callLater?: (waitMs: number, callback: () => void) => void; // default setTimeout; tests inject a fake
  secondsBetweenAtReplies?: number;
  logLine?: (line: string) => void;
};

export type WaitingRuns = {
  heartbeatWaiting: boolean;
  gmWaiting: boolean;
  welcomeWaiting?: boolean;
  waitingMentions: QueuedMention[];
  lastAtReplyFinishedMs: number | null;
  nowMs: number;
  secondsBetweenAtReplies: number;
};

export type NextRun =
  | { kind: "heartbeat" | "gm" | "welcome"; mention: null }
  | { kind: "atReply"; mention: QueuedMention }
  | { kind: "wait"; waitMs: number } // only @s are waiting and the last @-reply was under 60s ago
  | null; // nothing is waiting

export function oldestMention(waitingMentions: QueuedMention[]): QueuedMention | null {
  // Array.sort is stable, so two @s with the same sentAt keep the order they arrived in.
  return [...waitingMentions].sort((first, second) => Date.parse(first.sentAt) - Date.parse(second.sentAt))[0] ?? null;
}

// Order: heartbeat, then gm, then welcome, then @s oldest first. The 60s gap applies only between two @-reply
// runs, so an @ that arrived during a heartbeat runs as soon as the heartbeat finishes.
export function pickNextRun(waiting: WaitingRuns): NextRun {
  if (waiting.heartbeatWaiting) return { kind: "heartbeat", mention: null };
  if (waiting.gmWaiting) return { kind: "gm", mention: null };
  if (waiting.welcomeWaiting) return { kind: "welcome", mention: null };
  const mention = oldestMention(waiting.waitingMentions);
  if (!mention) return null;
  if (waiting.lastAtReplyFinishedMs !== null) {
    const allowedAtMs = waiting.lastAtReplyFinishedMs + waiting.secondsBetweenAtReplies * 1000;
    if (waiting.nowMs < allowedAtMs) return { kind: "wait", waitMs: allowedAtMs - waiting.nowMs };
  }
  return { kind: "atReply", mention };
}
