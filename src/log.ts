// Run log: one pretty-printed JSON file per run in logs/. See spec.md > Run log.
// Logs hold chat text; logs/ is gitignored and stays on the Mac.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const defaultLogsDirectory = join(repoRoot, "logs");

export type RunTrigger = "heartbeat" | "gm" | "at-reply" | string;
export type RunOutcome = "posted" | "skipped" | "failed" | "dry";

export type RunLog = {
  trigger: RunTrigger;
  conversationId: string;
  model: string;
  startedAt: string; // ISO
  finishedAt: string | null;
  durationMs: number | null;
  outcome: RunOutcome | null;
  firstUserMessage: string | null; // exactly what the model was shown
  modelTurns: any[]; // each turn: tool calls, arguments, results
  rejectedPlans: { plan: any; error: string }[];
  finalPlan: any | null;
  reason: string | null; // the plan's one-line reason
  sent: { action: any; messageId?: string; error?: string }[];
  tokens: { prompt: number; completion: number; total: number };
  error: string | null; // why a failed run failed
};

export function startRunLog(trigger: RunTrigger, conversationId: string, model: string): RunLog {
  return {
    trigger,
    conversationId,
    model,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    outcome: null,
    firstUserMessage: null,
    modelTurns: [],
    rejectedPlans: [],
    finalPlan: null,
    reason: null,
    sent: [],
    tokens: { prompt: 0, completion: 0, total: 0 },
    error: null,
  };
}

// Colons swapped for dashes so the name is safe everywhere; it still sorts by time.
export function runLogFileName(runLog: RunLog): string {
  return `${runLog.startedAt.replace(/:/g, "-")}-${runLog.trigger}.json`;
}

// Stamps finish time and duration, writes the file, returns its path.
export async function writeRunLog(runLog: RunLog, logsDirectory = defaultLogsDirectory): Promise<string> {
  const finishedAt = new Date();
  runLog.finishedAt = finishedAt.toISOString();
  runLog.durationMs = finishedAt.getTime() - new Date(runLog.startedAt).getTime();
  await mkdir(logsDirectory, { recursive: true });
  const logPath = join(logsDirectory, runLogFileName(runLog));
  await writeFile(logPath, JSON.stringify(runLog, null, 2) + "\n", "utf8");
  return logPath;
}

// Newest by file name (names start with the ISO start time). null when there are none.
export async function findNewestRunLogPath(logsDirectory = defaultLogsDirectory): Promise<string | null> {
  let fileNames: string[];
  try {
    fileNames = await readdir(logsDirectory);
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const logFileNames = fileNames.filter((fileName) => fileName.endsWith(".json")).sort();
  if (logFileNames.length === 0) return null;
  return join(logsDirectory, logFileNames[logFileNames.length - 1]);
}

export async function readNewestRunLogText(logsDirectory = defaultLogsDirectory): Promise<string | null> {
  const newestPath = await findNewestRunLogPath(logsDirectory);
  return newestPath ? readFile(newestPath, "utf8") : null;
}
