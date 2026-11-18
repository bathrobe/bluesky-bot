// One reply per message. A heartbeat or gm may not quote-reply a message Homer already replied to
// (for example an @ that an @-reply run answered minutes earlier), or the same message twice in one plan.
// @-reply runs are left out: their one message must reply to the mention.
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "./planRules.ts";

// Ids of messages Homer has already replied to, optionally only counting his replies sent after `sinceMs`.
export function messageIdsHomerRepliedTo(messages: any[], homerDid: string, sinceMs = 0): string[] {
  const repliedToIds = messages
    .filter((message) => message.sender?.did === homerDid && message.replyTo?.id && Date.parse(message.sentAt ?? "") >= sinceMs)
    .map((message) => message.replyTo.id as string);
  return [...new Set(repliedToIds)];
}

export function checkNoSecondReply(plan: PostPlan, context: PlanCheckContext): string[] {
  if (context.runKind === "at-reply") return [];
  const alreadyAnswered = new Set(messageIdsHomerRepliedTo(context.messages, context.homerDid));
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    if (action.type === "react" || action.type === "playlist_add" || !action.replyTo) return;
    if (alreadyAnswered.has(action.replyTo)) {
      errors.push(`action ${index + 1} (${action.type}): you already replied to {${action.replyTo}}. that message is answered. make a different move.`);
    }
    alreadyAnswered.add(action.replyTo); // a second reply to it later in this plan is also a repeat
  });
  return errors;
}
