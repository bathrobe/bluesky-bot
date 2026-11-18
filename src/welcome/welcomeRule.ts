// Plan check for the welcome run: one text (the verse), no reply target, and an epithet for every newcomer.
// Epithets belong to the welcome run only. An empty actions list (a skip) passes.
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "../plan/planRules.ts";

const normalize = (name: string) => name.trim().replace(/^@/, "").toLowerCase();

export function checkWelcome(plan: PostPlan, context: PlanCheckContext): string[] {
  const epithets = plan.epithets ?? [];
  if (context.runKind !== "welcome") return epithets.length > 0 ? ["epithets are given in the welcome run only. leave epithets out."] : [];
  if (plan.actions.length === 0) return [];
  const errors: string[] = [];
  const isOneText = plan.actions.length === 1 && plan.actions[0].type === "text";
  if (!isOneText) errors.push(`the welcome is exactly one text action. yours has: ${plan.actions.map((action) => action.type).join(", ")}.`);
  if (plan.actions.some((action) => action.type === "text" && action.replyTo)) errors.push("the welcome is not a reply: leave replyTo out.");
  const named = new Set(epithets.map((given) => normalize(given.member)));
  for (const name of context.newcomerNames ?? []) {
    if (!named.has(normalize(name))) errors.push(`no epithet for ${name}. add { member: "${name}", epithet: "..." } to epithets.`);
  }
  for (const given of epithets) {
    if (!(context.newcomerNames ?? []).some((name) => normalize(name) === normalize(given.member))) errors.push(`"${given.member}" is not one of the newcomers. epithets are for newcomers only.`);
    if (!given.epithet.trim() || given.epithet.length > 60) errors.push(`the epithet for ${given.member} must be a short phrase (under 60 characters).`);
  }
  return errors;
}
