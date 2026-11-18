// The `post` tool: the one call that ends every run. Its arguments are the plan.
// See spec.md > The post tool. The tool definition the model sees is in postToolDefinition.ts.
import { z } from "zod";

const reactActionSchema = z.object({
  type: z.literal("react"),
  messageId: z.string().min(1),
  emoji: z.string().min(1),
});

const textActionSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  replyTo: z.string().min(1).optional(),
});

const memeActionSchema = z.object({
  type: z.literal("meme"),
  file: z.string().min(1),
  caption: z.string().optional(),
  replyTo: z.string().min(1).optional(),
  onTheNose: z.object({ why: z.string().min(1) }).optional(),
});

const playlistAddActionSchema = z.object({
  type: z.literal("playlist_add"),
  messageId: z.string().min(1), // the transcript message holding the youtube link
});

export const postActionSchema = z.discriminatedUnion("type", [reactActionSchema, textActionSchema, memeActionSchema, playlistAddActionSchema]);

export const postArgumentsSchema = z.object({
  reason: z.string(),
  actions: z.array(postActionSchema), // empty = skip
  epithets: z.array(z.object({ member: z.string(), epithet: z.string() })).optional(), // welcome run only (welcome/welcomeRule.ts)
});

export type PostAction = z.infer<typeof postActionSchema>;
export type PostPlan = z.infer<typeof postArgumentsSchema>;

function describeIssue(issue: any): string {
  const where = issue.path?.length ? issue.path.join(".") : "(top level)";
  return `${where}: ${issue.message}`;
}

// Tool arguments arrive as a JSON string (spike-notes.md > Tool-call shape quirks).
// An object is accepted too, for tests and callers that already parsed it.
export function parsePostArguments(rawArguments: unknown): { ok: true; plan: PostPlan } | { ok: false; error: string } {
  let parsedArguments: unknown = rawArguments;
  if (typeof rawArguments === "string") {
    try {
      parsedArguments = JSON.parse(rawArguments);
    } catch (error: any) {
      return {
        ok: false,
        error: `the post arguments were not valid JSON (${error?.message}). call post again with a JSON object: {"reason": "...", "actions": [...]}.`,
      };
    }
  }
  const result = postArgumentsSchema.safeParse(parsedArguments);
  if (result.success) return { ok: true, plan: result.data };
  const problems = result.error.issues.map(describeIssue).join("; ");
  return {
    ok: false,
    error:
      `the post arguments have the wrong shape: ${problems}. ` +
      `each action needs a "type" of "react" (messageId, emoji), "text" (text, optional replyTo), ` +
      `"meme" (file, optional caption, replyTo, onTheNose) or "playlist_add" (messageId). call post again with the fixed plan.`,
  };
}
