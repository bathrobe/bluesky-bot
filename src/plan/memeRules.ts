// Plan check rules for meme actions: "meme exists" and "meme cooldown". See spec.md > Plan check.
// The cooldown itself lives in memes/usage.ts; this file turns it into error lines for the model.
import { decideOnTheNoseOverride, findSpentFiles, wholeDaysSince } from "../memes/usage.ts";
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "./planRules.ts";

const pickFresh = "pick one tagged `fresh` in the catalog, or drop the meme.";

export function checkMemes(plan: PostPlan, context: PlanCheckContext): string[] {
  const usage = context.memeUsage;
  const errors: string[] = [];
  const filesInThisPlan = new Set<string>();
  let overrideUsedInThisPlan = false;
  const spentFiles = usage ? findSpentFiles(usage.sendableFiles, usage.lastUsedByFile) : new Set<string>();

  plan.actions.forEach((action, index) => {
    if (action.type !== "meme") return;
    const label = `action ${index + 1} (meme)`;
    if (!usage) {
      errors.push(`${label}: memes can't be sent in this run: no meme catalog is loaded. drop the meme action; use text or react instead.`);
      return;
    }
    if (!usage.sendableFiles.includes(action.file)) {
      errors.push(
        `${label}: "${action.file}" is not in the catalog. copy a filename exactly from the meme catalog in your context; ` +
          `don't guess, shorten or change one. or drop the meme.`,
      );
      return;
    }
    if (filesInThisPlan.has(action.file)) {
      errors.push(`${label}: this plan already drops "${action.file}". a meme goes out once; drop the repeat or pick a different \`fresh\` one.`);
      return;
    }
    filesInThisPlan.add(action.file);
    if (!spentFiles.has(action.file)) return;

    const lastUsedDays = wholeDaysSince(usage.lastUsedByFile[action.file], usage.nowMs);
    if (!action.onTheNose) {
      errors.push(`${label}: "${action.file}" is \`spent\`: you already used it in this chat, ${lastUsedDays} days ago. ${pickFresh}`);
      return;
    }
    const decision = overrideUsedInThisPlan
      ? { allowed: false as const, why: "an earlier action in this plan already uses the override, and you get one at a time" }
      : decideOnTheNoseOverride(action.file, usage);
    if (!decision.allowed) {
      errors.push(`${label}: "${action.file}" is \`spent\` and the on-the-nose override is refused: ${decision.why}. ${pickFresh}`);
      return;
    }
    overrideUsedInThisPlan = true;
  });
  return errors;
}

// Run on a plan that passed: drops `onTheNose` from memes that did not need it (they were fresh).
// After this, a meme action with `onTheNose` in the validated plan means "the override was used",
// which is what the executor records as lastOverrideAt.
export function keepOnlyUsedOverrides(plan: PostPlan, context: PlanCheckContext): PostPlan {
  const usage = context.memeUsage;
  if (!usage) return plan;
  const spentFiles = findSpentFiles(usage.sendableFiles, usage.lastUsedByFile);
  const actions = plan.actions.map((action) => {
    if (action.type !== "meme" || !action.onTheNose || spentFiles.has(action.file)) return action;
    const { onTheNose: _unneededOverride, ...actionWithoutOverride } = action;
    return actionWithoutOverride;
  });
  return { ...plan, actions };
}

export function memeOverrideFiles(plan: PostPlan): string[] {
  return plan.actions.flatMap((action) => (action.type === "meme" && action.onTheNose ? [action.file] : []));
}
