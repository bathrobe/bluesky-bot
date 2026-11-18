// The tool loop: the model may look things up, then must end with one `post` that passes the plan
// check. This file never sends anything; it returns a checked plan or a failure.
// See spec.md > Run pipeline steps 3–4 and spike-notes.md > Tool calling.
import { config } from "../config.ts";
import type { PlanCheckContext } from "../plan/validatePlan.ts";
import type { PostPlan } from "../tools/post.ts";
import { postToolDefinition } from "../tools/postToolDefinition.ts";
import { callModel } from "./client.ts";
import { handleToolCall, plainTextRepromptText, type LookupTools, type ToolLoopState } from "./toolLoopCalls.ts";

export type { LookupTool, LookupTools } from "./toolLoopCalls.ts";

export type ToolLoopOptions = {
  messages: any[]; // system + first user message. Not mutated; the loop works on a copy
  planCheckContext: PlanCheckContext; // its knownMessageIds are the transcript's ids
  lookupTools?: LookupTools; // name → { definition, run }. Empty until item 21
  callModelFunction?: (options: { messages: any[]; tools: any[]; toolChoice?: any }) => Promise<any>; // tests inject a fake
  maxModelTurns?: number; // default config.model.maxTurns (8)
  maxLookupCalls?: number; // default config.caps.lookupsPerRun (4), shared by all lookup tools
};

export type ToolLoopFailureKind = "plain-text" | "rejected-plans" | "step-cap" | "model-error";

// Everything the run log wants, whether the loop ended well or not.
type ToolLoopRecord = {
  turns: any[]; // one per model turn: toolChoice, finishReason, text, reasoning, toolCalls[], usage
  rejectedPlans: { plan: any; error: string }[];
  tokens: { prompt: number; completion: number; total: number }; // summed over every turn
  model: string | null; // as reported by the gateway
  lookupCallsUsed: number;
  knownMessageIds: string[]; // transcript ids + ids lookups returned
  messages: any[]; // the whole conversation, for debugging
};
export type ToolLoopResult =
  | ({ ok: true; plan: PostPlan } & ToolLoopRecord)
  | ({ ok: false; failureKind: ToolLoopFailureKind; error: string } & ToolLoopRecord);

function recordOf(state: ToolLoopState): ToolLoopRecord {
  const { turns, rejectedPlans, tokens, model, lookupCallsUsed, messages } = state;
  return { turns, rejectedPlans, tokens, model, lookupCallsUsed, knownMessageIds: [...state.knownMessageIds], messages };
}
const failure = (state: ToolLoopState, failureKind: ToolLoopFailureKind, error: string): ToolLoopResult =>
  ({ ok: false, failureKind, error, ...recordOf(state) });

export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const callModelFunction = options.callModelFunction ?? callModel;
  const lookupTools = options.lookupTools ?? {};
  const maxModelTurns = options.maxModelTurns ?? config.model.maxTurns;
  const maxLookupCalls = options.maxLookupCalls ?? config.caps.lookupsPerRun;
  const settings = { planCheckContext: options.planCheckContext, lookupTools, maxLookupCalls };
  const tools = [postToolDefinition, ...Object.values(lookupTools).map((lookupTool) => lookupTool.definition)];
  const state: ToolLoopState = {
    messages: [...options.messages],
    turns: [],
    rejectedPlans: [],
    tokens: { prompt: 0, completion: 0, total: 0 },
    knownMessageIds: new Set(options.planCheckContext.knownMessageIds),
    lookupCallsUsed: 0,
    rejectedPlansInARow: 0,
    plainTextReprompted: false,
    model: null,
  };
  let toolChoice: "auto" | "required" = "auto";
  for (let turnNumber = 1; turnNumber <= maxModelTurns; turnNumber++) {
    let reply: any;
    try {
      reply = await callModelFunction({ messages: [...state.messages], tools, toolChoice });
    } catch (error: any) {
      return failure(state, "model-error", `model call failed on turn ${turnNumber}: ${error?.message ?? error}`);
    }
    const assistantMessage = reply.message;
    state.messages.push(assistantMessage); // as received, reasoning fields included
    state.model = reply.model ?? state.model;
    for (const key of ["prompt", "completion", "total"] as const) state.tokens[key] += reply.usage?.[key] ?? 0;
    const turn: any = { turnNumber, toolChoice, finishReason: reply.finishReason ?? null, text: assistantMessage.content ?? "",
      reasoning: assistantMessage.reasoning_content ?? null, toolCalls: [], usage: reply.usage ?? null, attemptsUsed: reply.attemptsUsed ?? 1 };
    state.turns.push(turn);
    toolChoice = "auto";

    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
    if (toolCalls.length === 0) {
      if (state.plainTextReprompted) return failure(state, "plain-text", "the model answered in plain text twice instead of calling post");
      state.plainTextReprompted = true;
      state.messages.push({ role: "user", content: plainTextRepromptText });
      turn.reprompted = true;
      toolChoice = "required"; // forces a tool call on the next turn only
      continue;
    }
    for (const toolCall of toolCalls) {
      const handled = await handleToolCall(toolCall, state, settings);
      const { name, arguments: rawArguments } = toolCall?.function ?? {};
      turn.toolCalls.push({ id: toolCall?.id, name, arguments: rawArguments, outcome: handled.outcome, result: handled.resultText });
      if (handled.plan) return { ok: true, plan: handled.plan, ...recordOf(state) };
      state.messages.push({ role: "tool", tool_call_id: toolCall?.id, content: handled.resultText });
      if (state.rejectedPlansInARow >= 2) return failure(state, "rejected-plans", `two plans in a row were rejected. last error: ${handled.resultText}`);
    }
  }
  return failure(state, "step-cap", `no valid post after ${maxModelTurns} model turns`);
}
