// Plan check rules for text hygiene and run shape (gm, @-reply). See spec.md > Plan check.
import { findPostLinks } from "../bluesky/richText.ts";
import { cleanText } from "../cleanText.ts";
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "./planRules.ts";

// Cleans every text (and meme caption) so what is sent is exactly what was checked.
// Returns the cleaned plan plus an error for each text that is empty after cleaning.
export function cleanPlanText(plan: PostPlan): { cleanedPlan: PostPlan; errors: string[] } {
  const errors: string[] = [];
  const cleanedActions = plan.actions.map((action, index) => {
    if (action.type === "text") {
      const { text } = cleanText(action.text);
      if (!text) {
        errors.push(
          `action ${index + 1} (text): the text is empty (after removing control tokens and stray "\\n"). write the message as plain text, or drop the action.`,
        );
      }
      return { ...action, text };
    }
    if (action.type === "meme" && action.caption !== undefined) {
      const { text: caption } = cleanText(action.caption);
      return { ...action, caption: caption || undefined };
    }
    return action;
  });
  return { cleanedPlan: { ...plan, actions: cleanedActions }, errors };
}

// Gm: exactly one text action, or an empty list (a deliberate skip).
export function checkGmShape(plan: PostPlan, context: PlanCheckContext): string[] {
  if (context.runKind !== "gm") return [];
  const isSkip = plan.actions.length === 0;
  const isOneText = plan.actions.length === 1 && plan.actions[0].type === "text";
  if (isSkip || isOneText) return [];
  const kinds = plan.actions.map((action) => action.type).join(", ");
  return [
    `this is the morning gm run: the plan must be exactly one text action (one short lowercase greeting) or an empty actions list to skip. yours has: ${kinds}.`,
  ];
}

// @-reply: one answer. At most one text or meme action, and it must quote-reply the mentioning message.
// A plan with no text or meme (empty, or reactions only) passes this rule.
export function checkAtReplyShape(plan: PostPlan, context: PlanCheckContext): string[] {
  if (context.runKind !== "at-reply") return [];
  const mentionId = context.mentioningMessageId;
  if (!mentionId) throw new Error("checkAtReplyShape: at-reply run without mentioningMessageId");
  const isMessage = (action: { type: string }) => action.type === "text" || action.type === "meme";
  const firstMessageIndex = plan.actions.findIndex(isMessage);
  if (firstMessageIndex === -1) return [];
  const messageCount = plan.actions.filter(isMessage).length;
  if (messageCount > 1) {
    return [
      `this run answers one @ with one message: the plan has ${messageCount} text + meme actions. put the whole answer in a single text (or one meme with a caption) that has replyTo "${mentionId}". reactions are still fine.`,
    ];
  }
  const firstMessage = plan.actions[firstMessageIndex] as { type: string; replyTo?: string };
  if (firstMessage.replyTo === mentionId) return [];
  return [
    `action ${firstMessageIndex + 1} (${firstMessage.type}): this run answers the message that mentioned you, so your first text or meme must have replyTo "${mentionId}". ` +
      `yours has ${firstMessage.replyTo ? `replyTo "${firstMessage.replyTo}"` : "no replyTo"}.`,
  ];
}

// One cited post per message: a chat message holds one embed, so a second bsky.app post link could only
// ever be a bare URL. Applies to every run kind, to text actions and to meme captions.
export function checkOnePostLinkPerMessage(plan: PostPlan): string[] {
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    const body = action.type === "text" ? action.text : action.type === "meme" ? (action.caption ?? "") : "";
    const postLinkCount = findPostLinks(body).length;
    if (postLinkCount > 1) {
      errors.push(
        `action ${index + 1} (${action.type}): ${postLinkCount} bluesky post links in one message. cite one post per message: keep the best one and drop the rest.`,
      );
    }
  });
  return errors;
}
