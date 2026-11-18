// The Plan check rules that look at counts and ids. Each returns error lines written for the model
// ([] = passes). See spec.md > Plan check. Shape rules (gm, @-reply) and text hygiene are in planShapeRules.ts; meme rules in memeRules.ts.
import { config } from "../config.ts";
import type { MemeUsage } from "../memes/usage.ts";
import type { PostPlan } from "../tools/post.ts";

export type RunKind = "heartbeat" | "gm" | "at-reply" | "welcome";

export type PlanCheckContext = {
  runKind: RunKind;
  knownMessageIds: Set<string> | string[]; // ids in this run's transcript + any search_chat results
  messages: any[]; // raw getMessages items (with reactions[]), for the repeat-reaction check
  homerDid: string;
  mentioningMessageId?: string; // required when runKind is "at-reply"
  caps?: { messagesPerRun: number; reactionsPerRun: number }; // defaults to config.caps
  heartbeatMinOtherMessages?: number; // defaults to config.caps (heartbeatPaceRules.ts)
  // This conversation's catalog + meme usage (memes/usage.ts > memeUsageForConvo). Left out = every meme action is rejected.
  memeUsage?: MemeUsage;
  newcomerNames?: string[]; // welcome run: short names that need an epithet (welcome/welcomeRule.ts)
  playlistVideoIds?: string[]; // video ids already on the playlist (playlist/playlistRule.ts)
};

export function checkSendCap(plan: PostPlan, context: PlanCheckContext): string[] {
  const caps = context.caps ?? config.caps;
  const messageCount = plan.actions.filter((action) => action.type === "text" || action.type === "meme").length;
  const reactionCount = plan.actions.filter((action) => action.type === "react").length;
  const errors: string[] = [];
  if (messageCount > caps.messagesPerRun) {
    errors.push(
      `too many messages: ${messageCount} text + meme actions, the limit is ${caps.messagesPerRun}. drop ${messageCount - caps.messagesPerRun}.`,
    );
  }
  if (reactionCount > caps.reactionsPerRun) {
    errors.push(
      `too many reactions: ${reactionCount} react actions, the limit is ${caps.reactionsPerRun}. drop ${reactionCount - caps.reactionsPerRun}.`,
    );
  }
  return errors;
}

export function checkRealMessageIds(plan: PostPlan, context: PlanCheckContext): string[] {
  const knownIds = new Set(context.knownMessageIds);
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    const namesMessage = action.type === "react" || action.type === "playlist_add";
    const referencedId = namesMessage ? action.messageId : action.replyTo;
    const fieldName = namesMessage ? "messageId" : "replyTo";
    if (referencedId === undefined || knownIds.has(referencedId)) return;
    errors.push(
      `action ${index + 1} (${action.type}): ${fieldName} "${referencedId}" is not a real message id. ` +
        `copy an id exactly from the {braces} in the transcript or from a search_chat result${namesMessage ? "" : ", or leave replyTo out"}.`,
    );
  });
  return errors;
}

export function checkNoRepeatReactions(plan: PostPlan, context: PlanCheckContext): string[] {
  const messageById = new Map(context.messages.map((message) => [message.id, message]));
  const reactionsInThisPlan = new Set<string>();
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    if (action.type !== "react") return;
    const key = `${action.messageId} ${action.emoji}`;
    const existingReactions = messageById.get(action.messageId)?.reactions ?? [];
    const homerAlreadyReacted = existingReactions.some(
      (reaction: any) => reaction.value === action.emoji && reaction.sender?.did === context.homerDid,
    );
    if (homerAlreadyReacted || reactionsInThisPlan.has(key)) {
      const where = homerAlreadyReacted ? "you already reacted" : "this plan already reacts";
      errors.push(
        `action ${index + 1} (react): ${where} ${action.emoji} on message ${action.messageId}. pick a different emoji or a different message, or drop it.`,
      );
    }
    reactionsInThisPlan.add(key);
  });
  return errors;
}
