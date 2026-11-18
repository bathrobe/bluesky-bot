import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "./prompt.ts";

function makePromptsFolder(files: Record<string, string>): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "homer-prompts-"));
  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(folder, fileName), content);
  }
  return folder;
}

describe("composeSystemPrompt", () => {
  it("joins SYSTEM.md and the skill file with a --- separator", () => {
    const folder = makePromptsFolder({ "SYSTEM.md": "you are homer\n", "skill.md": "# Skill\n\ndo the thing\n" });
    expect(composeSystemPrompt("skill.md", folder)).toBe("you are homer\n\n---\n\n# Skill\n\ndo the thing");
  });

  it("throws when the skill file is missing", () => {
    const folder = makePromptsFolder({ "SYSTEM.md": "you are homer" });
    expect(() => composeSystemPrompt("nope.md", folder)).toThrow();
  });

  it("builds the real heartbeat prompt: persona first, skill last, post tool described", () => {
    const prompt = composeSystemPrompt("heartbeat.md");
    expect(prompt.startsWith("You are homer")).toBe(true);
    expect(prompt.indexOf("# Heartbeat")).toBeGreaterThan(prompt.indexOf("## guardrails"));
    expect(prompt).toContain("search_chat");
    expect(prompt).toContain("search_bluesky");
    expect(prompt).toContain("end with exactly one `post` call");
  });

  it("carries nothing from the PRD remove list, and no template variables", () => {
    const prompt = composeSystemPrompt("heartbeat.md");
    expect(prompt).not.toMatch(/wine dark|signal|twitter|orality|people notes|generate_image|remix|90 days/i);
    expect(prompt).not.toMatch(/\{\{|\$\{/);
  });
});
