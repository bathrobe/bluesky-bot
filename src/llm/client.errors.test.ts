import { describe, expect, it, vi } from "vitest";
import { callModel } from "./client.ts";
import { baseOptions, jsonResponse, reply, toolCallMessage } from "./clientTestHelpers.ts";

describe("callModel: fatal errors and sleep", () => {
  it("does not retry a 400 or 401", async () => {
    for (const status of [400, 401]) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse("bad", status));
      await expect(callModel(baseOptions(fetchMock))).rejects.toThrow(`HTTP ${status}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("fails on finish_reason length without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ role: "assistant", content: "half a sent" }, "length"));
    await expect(callModel(baseOptions(fetchMock))).rejects.toThrow(/length/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails on finish_reason content_filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ role: "assistant", content: "x" }, "content_filter"));
    await expect(callModel(baseOptions(fetchMock))).rejects.toThrow(/content_filter/);
  });

  it("fails on an empty reply (blank text, no tool call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ role: "assistant", content: "  " }, "stop"));
    await expect(callModel(baseOptions(fetchMock))).rejects.toThrow(/empty/);
  });

  it("discards a reply that came back after the Mac slept, and retries", async () => {
    const clockReadings = [0, 600_000, 600_000, 601_000]; // attempt 1 took 10 minutes, attempt 2 took 1s
    const now = () => clockReadings.shift()!;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ role: "assistant", content: "stale" }, "stop"))
      .mockResolvedValueOnce(reply(toolCallMessage));
    const result = await callModel(baseOptions(fetchMock, { now }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.message).toEqual(toolCallMessage);
  });

  it("fails when both attempts slept", async () => {
    let clock = 0;
    const now = () => (clock += 600_000);
    const fetchMock = vi.fn().mockImplementation(async () => reply(toolCallMessage));
    await expect(callModel(baseOptions(fetchMock, { now }))).rejects.toThrow(/slept/);
  });

  it("never puts the API key in an error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse("nope", 401));
    const error: any = await callModel(baseOptions(fetchMock)).catch((caught) => caught);
    expect(String(error.message)).not.toContain("test-key");
  });
});
