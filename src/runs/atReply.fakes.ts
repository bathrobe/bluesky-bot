// A fake chat + scripted model for the @-reply tests. No network; nothing real is read or sent.
// The real tool loop and plan check run, so a plan without replyTo is rejected as it would be live.
// A reply that "lands" is appended to the fake history, so the already-answered check sees it next time.
import { vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { runToolLoop } from "../llm/toolLoop.ts";
import { createDefaultState, type HomerState } from "../state.ts";
import { HOMER_DID, shortHandleByDid } from "../transcript.fixtures.ts";
import { makeMentionMessage } from "../triggers/mentions.fixtures.ts";
import { toQueuedMention } from "../triggers/mentions.ts";

export { postReply } from "../llm/toolLoopTestHelpers.ts";
export const MENTION_ID = "3mention00001";

export const mentionMessage = (id = MENTION_ID, sentAt = "2026-11-14T19:00:00.000Z") => makeMentionMessage(id, HOMER_DID, { sentAt });
export const queuedMention = (message: any = mentionMessage()) => toQueuedMention(message, TEST_DM_CONVO_ID);
export const replyTo = (mentionMessageId: string, text = "hello back") => ({ type: "text", text, replyTo: mentionMessageId });

export type FakeWorldSettings = {
  history?: any[]; // what getMessages holds, oldest first. Default: the one mention
  transcriptMessages?: any[]; // the run's last-100 window, when it differs from the history
  modelReplies?: any[]; // scripted, in order; an Error is a failed model call
  state?: Partial<HomerState>;
};

export function makeAtReplyWorld(settings: FakeWorldSettings = {}) {
  const history = settings.history ?? [mentionMessage()];
  const savedState: HomerState = { ...createDefaultState(), ...settings.state };
  const modelReplies = [...(settings.modelReplies ?? [])];
  const modelCalls: any[] = [];
  const sentActions: any[] = [];
  const callModelFunction = async (options: any) => {
    modelCalls.push(options);
    const next = modelReplies.shift();
    if (!next || next instanceof Error) throw next ?? new Error("script ran out of replies");
    return next;
  };
  const dependencies = {
    createSession: vi.fn(async () => ({ homerDid: HOMER_DID })),
    fetchShortHandleByDid: vi.fn(async () => shortHandleByDid),
    fetchRecentMessages: vi.fn(async () => settings.transcriptMessages ?? history),
    fetchMessagesBackTo: vi.fn(async () => ({ messages: [...history], reachedStart: true })),
    loadSendableMemes: vi.fn(async () => []),
    runToolLoop: (options: any) => runToolLoop({ ...options, callModelFunction }),
    readState: vi.fn(async () => ({ ...savedState })),
    updateState: vi.fn(async (changeState: (state: HomerState) => void) => (changeState(savedState), savedState)),
    writeRunLog: vi.fn(async () => "logs/fake.json"),
    sendPlanAction: vi.fn(async (_sendContext: any, convoId: string, action: any) => {
      sentActions.push({ convoId, ...action });
      const newMessageId = `3homersent${String(sentActions.length).padStart(3, "0")}`;
      if (action.type === "react") return { sent: true, messageId: action.messageId } as any;
      const landed = { $type: "chat.bsky.convo.defs#messageView", id: newMessageId, text: action.text ?? "", reactions: [] };
      history.push({ ...landed, sender: { did: HOMER_DID }, sentAt: new Date().toISOString(), replyTo: action.replyTo ? { id: action.replyTo } : undefined });
      return { sent: true, messageId: newMessageId } as any;
    }),
  };
  const firstUserMessage = (callIndex = 0) => modelCalls[callIndex].messages[1].content as string;
  return { dependencies, savedState, history, modelCalls, sentActions, modelReplies, firstUserMessage };
}
