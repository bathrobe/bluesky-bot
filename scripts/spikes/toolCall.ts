// Spike: does tool calling work through the inference.coop gateway?
// Two turns with a dummy `post` tool. Turn 2 rejects the first plan, so the model should call `post` again.
// Run: pnpm tsx --env-file=.env scripts/spikes/toolCall.ts
import { config, readRequiredEnv } from "../../src/config.ts";

const apiKey = readRequiredEnv("INFERENCE_API_KEY");

const postTool = {
  type: "function",
  function: {
    name: "post",
    description: "Send your plan for the chat. An empty actions list means skip.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One line, for the log" },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "react"] },
              text: { type: "string" },
              messageId: { type: "string" },
              emoji: { type: "string" },
            },
            required: ["type"],
          },
        },
      },
      required: ["reason", "actions"],
    },
  },
};

const rateLimitHeaderPattern = /ratelimit|rate-limit|retry-after/i;

async function callModel(messages: any[]) {
  const response = await fetch(`${config.model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.model.name,
      messages,
      tools: [postTool],
      tool_choice: "auto",
      parallel_tool_calls: false,
    }),
    signal: AbortSignal.timeout(config.model.timeoutMs),
  });
  const rateLimitHeaders = [...response.headers.entries()].filter(([name]) => rateLimitHeaderPattern.test(name));
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${bodyText.slice(0, 1000)}`);
  return { body: JSON.parse(bodyText), rateLimitHeaders };
}

function reportTurn(turnLabel: string, result: { body: any; rateLimitHeaders: [string, string][] }) {
  const choice = result.body.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  let parsedArguments: any = null;
  try {
    parsedArguments = toolCall ? JSON.parse(toolCall.function.arguments) : null;
  } catch {}
  const ok = toolCall?.function?.name === "post" && parsedArguments && Array.isArray(parsedArguments.actions);
  console.log(`\n${turnLabel} tool call: ${ok ? "ok" : "FAILED"}`);
  console.log("  reported model:", result.body.model);
  console.log("  finish_reason:", choice?.finish_reason);
  console.log("  usage:", JSON.stringify(result.body.usage));
  console.log("  rate-limit headers:", result.rateLimitHeaders.length ? result.rateLimitHeaders : "none");
  console.log("  message keys:", Object.keys(choice?.message ?? {}).join(", "));
  console.log("  tool_calls count:", choice?.message?.tool_calls?.length ?? 0);
  console.log("  arguments type:", typeof toolCall?.function?.arguments);
  console.log("  arguments:", toolCall?.function?.arguments);
  if (!ok) console.log("  content:", choice?.message?.content);
  return { ok, toolCall, assistantMessage: choice?.message };
}

const messages: any[] = [
  { role: "system", content: "You are a friendly bot in a small group chat. Always reply by calling the `post` tool." },
  { role: "user", content: "Chat so far:\nalice 10:02: anyone tried the new pancake place on Elm St? {m1}\nbob 10:03: not yet, is it good? {m2}\n\nDecide what to send." },
];

const turnOne = reportTurn("turn 1", await callModel(messages));
if (!turnOne.ok) process.exit(1);

messages.push(turnOne.assistantMessage);
messages.push({
  role: "tool",
  tool_call_id: turnOne.toolCall.id,
  content: "Plan rejected: messageId \"m9\" is not in the transcript, and text must be under 80 characters. Nothing was sent. Call `post` again with a fixed plan.",
});

const turnTwo = reportTurn("turn 2", await callModel(messages));
if (!turnTwo.ok) process.exit(1);
