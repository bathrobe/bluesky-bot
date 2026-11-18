import { describe, expect, it, vi } from "vitest";
import { callModel } from "./client.ts";
import { baseOptions, jsonResponse, reply, toolCallMessage } from "./clientTestHelpers.ts";

describe("callModel: success and retries", () => {
  it("returns a tool-call message as received, with usage, even though content is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(toolCallMessage));
    const result = await callModel(baseOptions(fetchMock, { toolChoice: "required" }));
    expect(result.message).toEqual(toolCallMessage);
    expect(result.usage).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(result.attemptsUsed).toBe(1);
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.parallel_tool_calls).toBe(false);
    expect(sentBody.tool_choice).toBe("required");
    expect(sentBody.tools).toEqual([]);
  });

  it("retries once after a 429 and succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse("slow down", 429))
      .mockResolvedValueOnce(reply(toolCallMessage));
    const result = await callModel(baseOptions(fetchMock));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.attemptsUsed).toBe(2);
  });

  it("retries a transport error and a 503, then gives up after two attempts", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse("down", 503));
    await expect(callModel(baseOptions(fetchMock))).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a timeout abort as retryable", async () => {
    const hangUntilAborted = (_url: string, init: any) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    const fetchMock = vi.fn().mockImplementationOnce(hangUntilAborted).mockResolvedValueOnce(reply(toolCallMessage));
    const result = await callModel(baseOptions(fetchMock, { timeoutMs: 5 }));
    expect(result.attemptsUsed).toBe(2);
  });

  it("accepts a plain-text reply (the tool loop decides what to do with it)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ role: "assistant", content: "hello" }, "stop"));
    const result = await callModel(baseOptions(fetchMock));
    expect(result.message.content).toBe("hello");
  });
});
