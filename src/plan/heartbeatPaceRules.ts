// Heartbeat pacing, checked in code. Two rules, heartbeat runs only:
//   - quiet room: a text or meme needs enough messages from other people since Homer's last message.
//     Reactions and playlist adds always pass; so does a reply to a message that says his name or whose song he is adding.
//   - gm: the morning gm belongs to the gm run, so a heartbeat message may not open with "gm".
import { config } from "../config.ts";
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "./planRules.ts";

const HOMER_NAME_PATTERN = /\bhomer\b/i;
const OPENS_WITH_GM_PATTERN = /^\s*gm\b/i;

// Messages from other people after Homer's newest message. `messages` is oldest first.
export function otherMessagesSinceHomerSpoke(messages: any[], homerDid: string): any[] {
  const live = messages.filter((message) => message.$type === undefined || message.$type === "chat.bsky.convo.defs#messageView"); // no deletions, no joins
  const lastHomerIndex = live.findLastIndex((message) => message.sender?.did === homerDid);
  return live.slice(lastHomerIndex + 1);
}

export function isQuietSinceHomerSpoke(messages: any[], homerDid: string, minimum = config.caps.heartbeatMinOtherMessages): boolean {
  return otherMessagesSinceHomerSpoke(messages, homerDid).length < minimum;
}

export function checkQuietRoom(plan: PostPlan, context: PlanCheckContext): string[] {
  if (context.runKind !== "heartbeat") return [];
  const minimum = context.heartbeatMinOtherMessages ?? config.caps.heartbeatMinOtherMessages;
  const newMessages = otherMessagesSinceHomerSpoke(context.messages, context.homerDid);
  if (newMessages.length >= minimum) return [];
  const idsThatSayHisName = new Set(newMessages.filter((message) => HOMER_NAME_PATTERN.test(message.text ?? "")).map((message) => message.id));
  const idsGoingOnPlaylist = new Set(plan.actions.flatMap((action) => (action.type === "playlist_add" ? [action.messageId] : [])));
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    if (action.type === "react" || action.type === "playlist_add") return;
    if (action.replyTo && (idsThatSayHisName.has(action.replyTo) || idsGoingOnPlaylist.has(action.replyTo))) return; // telling someone their song went on
    errors.push(
      `action ${index + 1} (${action.type}): only ${newMessages.length} messages from other people since your last message (it takes ${minimum}). ` +
        `this tick is reactions only. drop this action.`,
    );
  });
  return errors;
}

export function checkNoHeartbeatGm(plan: PostPlan, context: PlanCheckContext): string[] {
  if (context.runKind !== "heartbeat") return [];
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    const words = action.type === "text" ? action.text : action.type === "meme" ? (action.caption ?? "") : "";
    if (!OPENS_WITH_GM_PATTERN.test(words)) return;
    errors.push(`action ${index + 1} (${action.type}): the morning gm is sent by its own run, not this one. say something that isn't a gm, or drop it.`);
  });
  return errors;
}
