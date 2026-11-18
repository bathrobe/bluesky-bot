// One chat-completion call to the gateway: timeout, retry, sleep detection.
// See spec.md > Run pipeline (llm/client.ts) and spec.md > Runtime (model call asleep mid-request).
import { config, readRequiredEnv } from "../config.ts";
import { isRetryableStatus, modelCallError, readAssistantMessage } from "./modelReply.ts";

export type CallModelOptions = {
  messages: any[];
  tools: any[];
  toolChoice?: "auto" | "required" | "none" | any; // caller decides; default "auto"
  // Injectable for tests. Defaults are the real thing.
  fetchImplementation?: typeof fetch;
  now?: () => number; // wall clock in ms
  waitMilliseconds?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  attempts?: number;
  sleepThresholdMs?: number; // a call longer than this means the Mac slept
  pauseBetweenAttemptsMs?: number;
  apiKey?: string;
};

const realWait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// One HTTP attempt. Throws errors tagged `retryable`; returns the parsed reply otherwise.
async function attemptOnce(options: CallModelOptions, apiKey: string, timeoutMs: number) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  let response: Response;
  let bodyText: string;
  try {
    response = await fetchImplementation(`${config.model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model.name,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.toolChoice ?? "auto",
        parallel_tool_calls: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    bodyText = await response.text();
  } catch (error: any) {
    // Network failure or our own timeout abort.
    throw modelCallError(`Model call transport error: ${error?.name ?? "Error"}: ${error?.message}`, true);
  }
  if (!response.ok) {
    const message = `Model call HTTP ${response.status}: ${bodyText.slice(0, 500)}`;
    throw modelCallError(message, isRetryableStatus(response.status));
  }
  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw modelCallError(`Model response was not JSON: ${bodyText.slice(0, 200)}`, false);
  }
  return readAssistantMessage(body);
}

// Returns { message, finishReason, model, usage: {prompt, completion, total}, rawUsage, attemptsUsed }.
// Throws on a fatal error, or when every attempt failed with a retryable one.
export async function callModel(options: CallModelOptions) {
  const apiKey = options.apiKey ?? readRequiredEnv("INFERENCE_API_KEY");
  const now = options.now ?? Date.now;
  const waitMilliseconds = options.waitMilliseconds ?? realWait;
  const timeoutMs = options.timeoutMs ?? config.model.timeoutMs;
  const attempts = options.attempts ?? config.model.attempts;
  const sleepThresholdMs = options.sleepThresholdMs ?? timeoutMs * 2;
  const pauseBetweenAttemptsMs = options.pauseBetweenAttemptsMs ?? 5_000;

  let lastError: any = null;
  for (let attemptNumber = 1; attemptNumber <= attempts; attemptNumber++) {
    if (attemptNumber > 1) await waitMilliseconds(pauseBetweenAttemptsMs);
    const startedAt = now();
    let result: any = null;
    let error: any = null;
    try {
      result = await attemptOnce(options, apiKey, timeoutMs);
    } catch (caught) {
      error = caught;
    }
    const elapsedMs = now() - startedAt;
    // The abort timer does not run while the Mac sleeps, so a call can come back long after its
    // timeout. Whatever it returned is stale: discard it and try again.
    if (elapsedMs > sleepThresholdMs) {
      lastError = modelCallError(`Model call took ${elapsedMs}ms (timeout ${timeoutMs}ms); the Mac likely slept`, true);
      continue;
    }
    if (result) return { ...result, attemptsUsed: attemptNumber };
    lastError = error;
    if (!error?.retryable) throw error;
  }
  throw lastError;
}
