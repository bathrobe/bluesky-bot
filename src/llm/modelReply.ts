// Turns one raw /chat/completions response into either a usable assistant message or an error.
// Errors carry `retryable` so the client knows whether a second attempt is worth it.

export function modelCallError(message: string, retryable: boolean) {
  return Object.assign(new Error(message), { retryable });
}

// Transport-level trouble the gateway may get over on its own.
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function normalizeUsage(usage: any) {
  return {
    prompt: usage?.prompt_tokens ?? 0,
    completion: usage?.completion_tokens ?? 0,
    total: usage?.total_tokens ?? 0,
  };
}

// A reply is usable when it has tool calls, or non-blank text. Content is "" on a tool-call turn,
// so text alone is not the test. `length` and `content_filter` mean a cut or blocked reply.
export function readAssistantMessage(body: any) {
  const choice = body?.choices?.[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason ?? null;
  if (!message) throw modelCallError("Model response had no choices[0].message", false);
  if (finishReason === "length") throw modelCallError("Model reply was cut off (finish_reason: length)", false);
  if (finishReason === "content_filter") {
    throw modelCallError("Model reply was blocked (finish_reason: content_filter)", false);
  }
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const hasText = typeof message.content === "string" && message.content.trim().length > 0;
  if (!hasToolCalls && !hasText) throw modelCallError("Model reply was empty (no text, no tool call)", false);
  return {
    message, // as received, so it can be passed back in the next turn unchanged
    finishReason,
    model: body.model ?? null,
    usage: normalizeUsage(body.usage),
    rawUsage: body.usage ?? null,
  };
}
