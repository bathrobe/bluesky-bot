// The Sender: the ONLY file in src/ that writes to Bluesky. See spec.md > Sender. Every function here:
// (1) throws if the conversation is not in config.allowedConvoIds, (2) returns without sending while `paused`.
// One exception to (2): sendOffSwitchConfirmation, fixed to the test DM, must confirm "off" AFTER paused is written.
// Nothing here can create a public post, like, follow or reply. Shapes: spike-notes.md > Chat shapes.
import { config } from "../config.ts";
import { easternDateKey } from "../easternDate.ts";
import { readState, updateState, type HomerState } from "../state.ts";
import type { PostLinkResolver } from "../memes/resolvePosts.ts";
import type { PostAction } from "../tools/post.ts";
import { buildMemeMessages } from "./memeMessage.ts";
import { withSessionRetry } from "./session.ts";
import { buildTextMessage } from "./textMessage.ts";

export type SendContext = {
  session: any; // from createSession(): { agent, chatAgent, ... }
  readState?: () => Promise<{ paused: boolean; lastAlertDate?: string | null }>; // default: state.json. Tests inject a fake
  updateState?: (changeState: (state: HomerState) => void) => Promise<unknown>; // default: state.json (alert date)
  resolvePostLinks?: PostLinkResolver; // default: through the session. Tests inject a fake
};

export type SendResult = { sent: true; messageId: string } | { sent: false; reason: "paused" | "alerted-today" }; // messageId: the new message's id; for a reaction, the TARGET's id

export type MemePostRef = { uri: string; cid: string }; // the meme's public post, from the catalog

export function assertAllowedConvo(convoId: string): void {
  if (!config.allowedConvoIds.includes(convoId)) {
    throw new Error(`Refusing to send to conversation ${convoId}: not in config.allowedConvoIds`);
  }
}

// The two gates, in order. Returns true when the send may go ahead.
async function passesGates(context: SendContext, convoId: string): Promise<boolean> {
  assertAllowedConvo(convoId);
  const state = await (context.readState ?? readState)();
  return !state.paused;
}

const pausedResult: SendResult = { sent: false, reason: "paused" };
async function sendChatMessage(context: SendContext, convoId: string, message: any, replyToMessageId?: string): Promise<SendResult> {
  if (!(await passesGates(context, convoId))) return pausedResult;
  return sendChatMessageIgnoringPaused(context, convoId, message, replyToMessageId);
}

// Allow list only, no paused check. Not exported: only sendOffSwitchConfirmation uses it directly.
async function sendChatMessageIgnoringPaused(context: SendContext, convoId: string, message: any, replyToMessageId?: string): Promise<SendResult> {
  assertAllowedConvo(convoId);
  if (replyToMessageId) message.replyTo = { messageId: replyToMessageId };
  const response: any = await withSessionRetry(context.session, () =>
    context.session.chatAgent.chat.bsky.convo.sendMessage({ convoId, message }),
  );
  return { sent: true, messageId: response.data.id };
}

export async function sendText(context: SendContext, convoId: string, text: string, replyToMessageId?: string): Promise<SendResult> {
  if (!(await passesGates(context, convoId))) return pausedResult;
  const message = await buildTextMessage(text, context.session, context.resolvePostLinks); // clickable links; a cited post becomes the card
  return sendChatMessageIgnoringPaused(context, convoId, message, replyToMessageId);
}

// A meme is a chat message that embeds its public post. A post cited in the caption is sent first, as its own card.
export async function sendMemeEmbed(context: SendContext, convoId: string, memePost: MemePostRef, caption = "", replyToMessageId?: string): Promise<SendResult> {
  if (!(await passesGates(context, convoId))) return pausedResult;
  const { citedPostMessage, memeMessage } = await buildMemeMessages(caption, memePost, context.session, context.resolvePostLinks);
  if (!citedPostMessage) return sendChatMessageIgnoringPaused(context, convoId, memeMessage, replyToMessageId);
  await sendChatMessageIgnoringPaused(context, convoId, citedPostMessage, replyToMessageId);
  return sendChatMessage(context, convoId, memeMessage); // gates checked again between the two sends
}

export async function addReaction(context: SendContext, convoId: string, messageId: string, emoji: string): Promise<SendResult> {
  if (!(await passesGates(context, convoId))) return pausedResult;
  await withSessionRetry(context.session, () =>
    context.session.chatAgent.chat.bsky.convo.addReaction({ convoId, messageId, value: emoji }),
  );
  return { sent: true, messageId };
}

// Fixed to the test DM, at most one per Eastern day. The date is written only after the alert lands, so it can be retried.
export async function sendOperatorAlert(context: SendContext, text: string, now = new Date()): Promise<SendResult> {
  const today = easternDateKey(now);
  if ((await (context.readState ?? readState)()).lastAlertDate === today) return { sent: false, reason: "alerted-today" };
  const result = await sendText(context, config.testDmConvoId, text);
  if (result.sent) await (context.updateState ?? updateState)((state) => (state.lastAlertDate = today));
  return result;
}

// The off switch's reply. Test DM only, NOT gated by `paused`: paused is written first, then confirmed. Only offSwitch.ts calls it.
export async function sendOffSwitchConfirmation(context: SendContext, text: string): Promise<SendResult> {
  return sendChatMessageIgnoringPaused(context, config.testDmConvoId, { text });
}

// One plan action → one Sender call. `findMemePost` is the catalog lookup (file → uri + cid).
export async function sendPlanAction(context: SendContext, convoId: string, action: Exclude<PostAction, { type: "playlist_add" }>, findMemePost?: (file: string) => MemePostRef | undefined): Promise<SendResult> {
  assertAllowedConvo(convoId);
  if (action.type === "react") return addReaction(context, convoId, action.messageId, action.emoji);
  if (action.type === "text") return sendText(context, convoId, action.text, action.replyTo);
  const memePost = findMemePost?.(action.file);
  if (!memePost) throw new Error(`meme "${action.file}" cannot be sent: no catalog post for it (meme sends arrive in item 16)`);
  return sendMemeEmbed(context, convoId, memePost, action.caption ?? "", action.replyTo);
}
