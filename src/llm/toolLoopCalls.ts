// What the tool loop does with one tool call: check a `post` plan, run a lookup, or answer with an
// error the model can read. Nothing here sends anything. See spec.md > Run pipeline steps 3–4.
import { validatePlan, type PlanCheckContext } from "../plan/validatePlan.ts";
import type { PostPlan } from "../tools/post.ts";

// A lookup tool (item 21 registers search_chat and search_bluesky). `messageIds` it returns become
// "real" for the plan check, so the model may react or reply to a message a search found.
export type LookupTool = {
  definition: any; // OpenAI-style tool definition; its function.name should match the map key
  run: (parsedArguments: any) => Promise<{ resultText: string; messageIds?: string[] }>;
};
export type LookupTools = Record<string, LookupTool>;

export type ToolLoopState = {
  messages: any[]; // the conversation so far, grown turn by turn
  turns: any[]; // for the run log
  rejectedPlans: { plan: any; error: string }[];
  tokens: { prompt: number; completion: number; total: number };
  knownMessageIds: Set<string>; // transcript ids + ids returned by lookups
  lookupCallsUsed: number;
  rejectedPlansInARow: number;
  plainTextReprompted: boolean;
  model: string | null;
};

export type ToolCallOutcome = "plan-accepted" | "plan-rejected" | "lookup" | "lookup-error" | "lookup-cap" | "unknown-tool";
export type HandledToolCall = { outcome: ToolCallOutcome; resultText: string; plan?: PostPlan };

export const plainTextRepromptText =
  "you answered in plain text, so nothing was sent. the only way to act is the post tool. " +
  'call post now with your plan. to do nothing, call post with an empty actions list: {"reason": "...", "actions": []}.';

function parseJsonOrKeep(rawArguments: unknown): any {
  if (typeof rawArguments !== "string") return rawArguments;
  try {
    return JSON.parse(rawArguments);
  } catch {
    return rawArguments;
  }
}

function handlePostCall(rawArguments: unknown, state: ToolLoopState, planCheckContext: PlanCheckContext): HandledToolCall {
  const checked = validatePlan(rawArguments, { ...planCheckContext, knownMessageIds: state.knownMessageIds });
  if (checked.ok) return { outcome: "plan-accepted", resultText: "plan accepted", plan: checked.plan };
  state.rejectedPlansInARow += 1;
  state.rejectedPlans.push({ plan: parseJsonOrKeep(rawArguments), error: checked.error });
  return { outcome: "plan-rejected", resultText: checked.error };
}

async function handleLookupCall(toolName: string, lookupTool: LookupTool, rawArguments: unknown, state: ToolLoopState, maxLookupCalls: number): Promise<HandledToolCall> {
  if (state.lookupCallsUsed >= maxLookupCalls) {
    const resultText = `lookups are used up (${maxLookupCalls} per run), so ${toolName} did not run. call post now with your plan.`;
    return { outcome: "lookup-cap", resultText };
  }
  const parsedArguments = parseJsonOrKeep(rawArguments ?? "{}");
  if (parsedArguments === null || typeof parsedArguments !== "object") {
    return { outcome: "lookup-error", resultText: `the ${toolName} arguments were not a JSON object. call it again with valid JSON, or call post.` };
  }
  state.lookupCallsUsed += 1;
  const lookupsLeft = maxLookupCalls - state.lookupCallsUsed;
  try {
    const lookupResult = await lookupTool.run(parsedArguments);
    for (const messageId of lookupResult.messageIds ?? []) state.knownMessageIds.add(messageId);
    state.rejectedPlansInARow = 0; // "in a row" means two post calls with no successful lookup between
    return { outcome: "lookup", resultText: `${lookupResult.resultText}\n\n(lookups left this run: ${lookupsLeft})` };
  } catch (error: any) {
    const resultText = `${toolName} failed: ${error?.message ?? error}. lookups left this run: ${lookupsLeft}. try again or call post without it.`;
    return { outcome: "lookup-error", resultText };
  }
}

// One tool call in, the text for its tool result out (plus the plan, when a `post` passed the check).
export async function handleToolCall(
  toolCall: any,
  state: ToolLoopState,
  settings: { planCheckContext: PlanCheckContext; lookupTools: LookupTools; maxLookupCalls: number },
): Promise<HandledToolCall> {
  const toolName = toolCall?.function?.name;
  const rawArguments = toolCall?.function?.arguments;
  if (toolName === "post") return handlePostCall(rawArguments, state, settings.planCheckContext);
  const lookupTool = Object.hasOwn(settings.lookupTools, toolName ?? "") ? settings.lookupTools[toolName] : null;
  if (lookupTool) return handleLookupCall(toolName, lookupTool, rawArguments, state, settings.maxLookupCalls);
  const availableNames = ["post", ...Object.keys(settings.lookupTools)].join(", ");
  return { outcome: "unknown-tool", resultText: `there is no tool named "${toolName}". the tools are: ${availableNames}. call post to end the run.` };
}
