// A scripted fake model for the tool loop tests: replies come off a list, calls are recorded. No network.
import { makeContext } from "../plan/validatePlanTestHelpers.ts";
import { runToolLoop, type ToolLoopOptions } from "./toolLoop.ts";

const usage = { prompt: 10, completion: 5, total: 15 };
let nextCallNumber = 1;

const reply = (message: any, finishReason: string) => ({ message, finishReason, model: "fake-model", usage, attemptsUsed: 1 });

export function toolCallReply(name: string, toolArguments: any) {
  const serializedArguments = typeof toolArguments === "string" ? toolArguments : JSON.stringify(toolArguments);
  const toolCall = { id: `call_${nextCallNumber++}`, type: "function", function: { name, arguments: serializedArguments } };
  return reply({ role: "assistant", content: "", reasoning_content: "thinking", tool_calls: [toolCall] }, "tool_calls");
}
export const postReply = (...actions: any[]) => toolCallReply("post", { reason: "test", actions });
export const textReply = (content: string) => reply({ role: "assistant", content }, "stop");

// Returns the scripted replies in order and records what each call was given.
// Running past the end of the script throws, which the loop reports as a model error.
export function scriptedModel(replies: any[]) {
  const calls: any[] = [];
  const callModelFunction = async (options: any) => {
    calls.push(options);
    const next = replies[calls.length - 1];
    if (!next) throw new Error("script ran out of replies");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, callModelFunction };
}

export const startMessages = [
  { role: "system", content: "you are a test" },
  { role: "user", content: "transcript goes here" },
];

export async function runScript(replies: any[], extraOptions: Partial<ToolLoopOptions> = {}) {
  const model = scriptedModel(replies);
  const result = await runToolLoop({
    messages: startMessages,
    planCheckContext: makeContext(),
    callModelFunction: model.callModelFunction,
    ...extraOptions,
  });
  return { result, calls: model.calls };
}

// A lookup tool that records its arguments and returns a fixed result.
export function fakeLookupTool(name: string, result: { resultText: string; messageIds?: string[] } | Error) {
  const receivedArguments: any[] = [];
  const definition = { type: "function", function: { name, description: "fake", parameters: { type: "object", properties: {} } } };
  const run = async (parsedArguments: any) => {
    receivedArguments.push(parsedArguments);
    if (result instanceof Error) throw result;
    return result;
  };
  return { receivedArguments, tool: { definition, run } };
}
