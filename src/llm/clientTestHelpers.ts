// Shared fixtures for the client tests: canned gateway responses, no network.
export const toolCallMessage = {
  role: "assistant",
  content: "",
  reasoning_content: "thinking",
  tool_calls: [{ id: "call_1", type: "function", function: { name: "post", arguments: '{"reason":"r","actions":[]}' } }],
};
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };

export function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}
export function reply(message: any, finishReason = "tool_calls") {
  return jsonResponse({ model: "m", usage, choices: [{ message, finish_reason: finishReason }] });
}

// Every test: no network, no real waiting, a fixed key.
export function baseOptions(fetchImplementation: any, extra: any = {}) {
  return { messages: [{ role: "user", content: "hi" }], tools: [], apiKey: "test-key",
    fetchImplementation, waitMilliseconds: async () => {}, ...extra };
}
