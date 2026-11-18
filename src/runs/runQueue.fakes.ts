// Test helpers for runQueue.test.ts. No network, no timers beyond setTimeout(0).
import { createRunQueue } from "./runQueue.ts";

const oneTick = () => new Promise((resolve) => setTimeout(resolve, 0));
export const settle = async () => { for (let tick = 0; tick < 8; tick++) await oneTick(); }; // let every queued step finish
export const mention = (messageId: string, sentAt: string) => ({ messageId, sentAt: `2026-11-14T12:${sentAt}Z` });

// A queue on fakes: a clock the test moves, a paused flag, and runs that record start/end.
// A run named in `held` waits until the test calls release[name]().
export function makeQueue(settings: { held?: string[]; throwing?: string[] } = {}) {
  const events: string[] = [];
  const [finished, lines]: [any[], string[]] = [[], []];
  const world = { nowMs: 1_000_000, paused: false };
  const wakeUps: { waitMs: number; callback: () => void }[] = [];
  const release: Record<string, () => void> = {};
  const run = async (name: string) => {
    events.push(`start ${name}`);
    if (settings.held?.includes(name)) await new Promise<void>((resolve) => (release[name] = resolve));
    else await oneTick();
    events.push(`end ${name}`);
    if (settings.throwing?.includes(name)) throw new Error(`${name} blew up`);
    return { outcome: "posted" };
  };
  const queue = createRunQueue({
    runFunctions: { heartbeat: () => run("heartbeat"), gm: () => run("gm"), atReply: (queued) => run(queued.messageId) },
    isPaused: async () => world.paused,
    onRunFinished: (finishedRun) => void finished.push(finishedRun),
    nowMs: () => world.nowMs,
    callLater: (waitMs, callback) => void wakeUps.push({ waitMs, callback }),
    logLine: (line) => lines.push(line),
  });
  const starts = () => events.filter((event) => event.startsWith("start")).map((event) => event.slice(6));
  return { queue, events, finished, lines, world, wakeUps, release, starts };
}
