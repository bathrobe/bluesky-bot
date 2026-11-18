// System prompt = Homer's identity (prompts/SYSTEM.md) + "---" + one skill file
// (prompts/heartbeat.md, at-reply.md, morning-gm.md). No template variables: the
// transcript, catalog and run notes go in the first user message instead.
// Ported from Signal Homer's runner/prompt.ts, trimmed.
import fs from "node:fs";
import path from "node:path";

const SEPARATOR = "\n\n---\n\n";
const SYSTEM_FILE = "SYSTEM.md";

export function composeSystemPrompt(
  skillFile: string,
  promptsFolder: string = path.resolve(process.cwd(), "prompts"),
): string {
  const systemContent = fs.readFileSync(path.resolve(promptsFolder, SYSTEM_FILE), "utf8");
  const skillContent = fs.readFileSync(path.resolve(promptsFolder, skillFile), "utf8");
  return [systemContent.trim(), skillContent.trim()].join(SEPARATOR);
}
