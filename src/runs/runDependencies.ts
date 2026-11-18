// The outside world a run touches, gathered in one object so tests can swap in fakes.
// Also the one place that turns config.target into a conversation id.
import { config } from "../config.ts";
import { fetchMessagesBackTo, fetchRecentMessages, fetchShortHandleByDid } from "../bluesky/history.ts";
import { sendPlanAction } from "../bluesky/send.ts";
import { createSession } from "../bluesky/session.ts";
import { runToolLoop } from "../llm/toolLoop.ts";
import { writeRunLog } from "../log.ts";
import { loadSendableMemesOnce } from "./runMemes.ts";
import { readState, updateState } from "../state.ts";

export const defaultRunDependencies = {
  createSession: createSession as () => Promise<any>,
  fetchRecentMessages: fetchRecentMessages as (session: any, convoId: string, options?: any) => Promise<any[]>,
  // @-reply only: everything since the mention, for the already-answered check
  fetchMessagesBackTo: fetchMessagesBackTo as (session: any, convoId: string, sinceMs: number) => Promise<{ messages: any[]; reachedStart: boolean }>,
  fetchShortHandleByDid: fetchShortHandleByDid as (session: any, convoId: string) => Promise<Record<string, string>>,
  loadSendableMemes: loadSendableMemesOnce as (session: any) => Promise<any[]>, // catalog, resolved once per process
  runToolLoop,
  sendPlanAction, // live sends; the Sender checks the allow list and `paused` itself
  readState: () => readState(),
  updateState: (changeState: Parameters<typeof updateState>[0]) => updateState(changeState),
  writeRunLog: (runLog: Parameters<typeof writeRunLog>[0]) => writeRunLog(runLog),
};

export type RunDependencies = typeof defaultRunDependencies;

// "dm" → the test DM, "group" → the group. Refuses anything not on the allow list, so the group
// cannot even be read until scripts/acceptGroup.ts adds it at launch.
export function targetConvoId(
  target: string = config.target,
  allowedConvoIds: string[] = config.allowedConvoIds,
): string {
  const convoId = target === "group" ? config.groupConvoId : config.testDmConvoId;
  if (!allowedConvoIds.includes(convoId)) {
    throw new Error(`Refusing conversation ${convoId}: not in config.allowedConvoIds`);
  }
  return convoId;
}

// An @-reply runs in the conversation its @ came from, which must be on the allow list too.
export function allowedRunConvoId(convoId: string, allowedConvoIds: string[] = config.allowedConvoIds): string {
  if (!allowedConvoIds.includes(convoId)) throw new Error(`Refusing conversation ${convoId}: not in config.allowedConvoIds`);
  return convoId;
}
