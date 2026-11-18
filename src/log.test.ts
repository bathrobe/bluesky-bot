import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findNewestRunLogPath, readNewestRunLogText, startRunLog, writeRunLog } from "./log.ts";

describe("run log", () => {
  it("writes a pretty-printed log named <time>-<trigger>.json with every spec field", async () => {
    const logsDirectory = await mkdtemp(join(tmpdir(), "homer-logs-"));
    const runLog = startRunLog("heartbeat", "3myzmduu7x32v", "tinfoil/deepseek-v4-1-flash");
    runLog.outcome = "dry";
    runLog.firstUserMessage = "sample transcript";
    const logPath = await writeRunLog(runLog, logsDirectory);

    expect(logPath).toMatch(/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d+Z-heartbeat\.json$/);
    const savedText = await readFile(logPath, "utf8");
    expect(savedText).toContain('\n  "trigger": "heartbeat"');
    const saved = JSON.parse(savedText);
    for (const field of ["conversationId", "model", "firstUserMessage", "modelTurns", "rejectedPlans",
      "finalPlan", "reason", "sent", "tokens", "durationMs", "outcome"]) {
      expect(saved).toHaveProperty(field);
    }
    expect(saved.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("finds the newest log, and null when there are none", async () => {
    const logsDirectory = await mkdtemp(join(tmpdir(), "homer-logs-"));
    expect(await findNewestRunLogPath(logsDirectory)).toBeNull();
    expect(await findNewestRunLogPath(join(logsDirectory, "missing"))).toBeNull();

    const olderLog = startRunLog("gm", "convo", "model");
    olderLog.startedAt = "2026-11-14T08:00:00.000Z";
    await writeRunLog(olderLog, logsDirectory);
    const newerLog = startRunLog("heartbeat", "convo", "model");
    newerLog.startedAt = "2026-11-14T09:00:00.000Z";
    const newerPath = await writeRunLog(newerLog, logsDirectory);

    expect(await findNewestRunLogPath(logsDirectory)).toBe(newerPath);
    expect(JSON.parse((await readNewestRunLogText(logsDirectory))!).trigger).toBe("heartbeat");
  });
});
