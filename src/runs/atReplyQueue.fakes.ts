// The real run queue, @-reply reporter and @-reply run, wired as in main.ts, on a fake chat
// (atReply.fakes.ts) and a clock and timers the test moves. No network.
import { makeFakeSendContext } from "../bluesky/send.ts.fakes.ts";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { handleNewMessage } from "../handleNewMessage.ts";
import { HOMER_DID, JOE_DID, NOW_MS } from "../transcript.fixtures.ts";
import { makeEvent } from "../triggers/mentions.fixtures.ts";
import { runAtReply } from "./atReply.ts";
import { makeAtReplyWorld, type FakeWorldSettings } from "./atReply.fakes.ts";
import { createAtReplyRunReporter } from "./atReplyRetry.ts";
import { settle } from "./runQueue.fakes.ts";
import { createRunQueue } from "./runQueue.ts";

export { settle } from "./runQueue.fakes.ts";

export function makeHarness(settings: FakeWorldSettings, paused = false) {
  const world = makeAtReplyWorld(settings);
  const [flags, clock, lines, alerts] = [{ paused }, { nowMs: NOW_MS }, [] as string[], [] as string[]];
  const laterCalls: { waitMs: number; callback: () => void }[] = [];
  const callLater = (waitMs: number, callback: () => void) => void laterCalls.push({ waitMs, callback });
  const logLine = (line: string) => void lines.push(line);
  const enqueueMention = (mention: any): boolean => queue.enqueueMention(mention);
  const sendAlert = async (text: string) => void alerts.push(text);
  const queue = createRunQueue({
    runFunctions: { atReply: (mention) => runAtReply(mention, { dryRun: false, dependencies: world.dependencies }) },
    isPaused: async () => flags.paused,
    onRunFinished: createAtReplyRunReporter({ enqueueMention, sendAlert, callLater, logLine }),
    nowMs: () => clock.nowMs,
    callLater,
    logLine,
  });
  const fireNextTimer = async () => {
    const next = laterCalls.shift()!;
    clock.nowMs += next.waitMs;
    next.callback();
    await settle();
    return next.waitMs;
  };
  const handle = (message: any) =>
    handleNewMessage(makeEvent(message, TEST_DM_CONVO_ID), { homerDid: HOMER_DID, joeDid: JOE_DID, sendContext: makeFakeSendContext().context, enqueueMention, logLine });
  return { world, queue, flags, lines, alerts, laterCalls, fireNextTimer, handle, enqueueMention };
}
