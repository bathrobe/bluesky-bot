// Plan check: the model's `post` arguments in, a plan safe to send (or error text for the model) out.
// Pure: no network, no state file. See spec.md > Plan check.
// Every rule runs, so the model hears about all its mistakes in one rejection.
import { parsePostArguments, type PostPlan } from "../tools/post.ts";
import { checkMemes, keepOnlyUsedOverrides } from "./memeRules.ts";
import {
  checkNoRepeatReactions,
  checkRealMessageIds,
  checkSendCap,
  type PlanCheckContext,
} from "./planRules.ts";
import { checkNoHeartbeatGm, checkQuietRoom } from "./heartbeatPaceRules.ts";
import { checkPlaylist } from "../playlist/playlistRule.ts";
import { checkWelcome } from "../welcome/welcomeRule.ts";
import { checkNoSecondReply } from "./repeatReplyRule.ts";
import { checkAtReplyShape, checkGmShape, checkOnePostLinkPerMessage, cleanPlanText } from "./planShapeRules.ts";

export type { PlanCheckContext, RunKind } from "./planRules.ts";

export type ValidatePlanResult = { ok: true; plan: PostPlan } | { ok: false; error: string };

const planRules = [checkSendCap, checkRealMessageIds, checkNoRepeatReactions, checkMemes, checkGmShape, checkAtReplyShape, checkOnePostLinkPerMessage, checkNoSecondReply, checkQuietRoom, checkNoHeartbeatGm, checkPlaylist, checkWelcome];

function rejection(problems: string[]): { ok: false; error: string } {
  const list = problems.map((problem) => `- ${problem}`).join("\n");
  return { ok: false, error: `plan rejected, nothing was sent. fix these and call post again:\n${list}` };
}

// `rawArguments` is the tool call's arguments: the JSON string from the model, or an already-parsed object.
// On success, `plan` carries the cleaned text: send exactly that. A meme action in it has
// `onTheNose` only if the on-the-nose override was actually used (see memeRules.ts).
export function validatePlan(rawArguments: unknown, context: PlanCheckContext): ValidatePlanResult {
  const parsed = parsePostArguments(rawArguments);
  if (!parsed.ok) return rejection([parsed.error]);
  const { cleanedPlan, errors: hygieneErrors } = cleanPlanText(parsed.plan);
  const ruleErrors = planRules.flatMap((rule) => rule(cleanedPlan, context));
  const problems = [...ruleErrors, ...hygieneErrors];
  if (problems.length > 0) return rejection(problems);
  return { ok: true, plan: keepOnlyUsedOverrides(cleanedPlan, context) };
}
