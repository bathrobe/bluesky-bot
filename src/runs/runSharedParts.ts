// Types and small pure pieces of runShared.ts, split out to keep that file short.
import type { LookupTools } from "../llm/toolLoop.ts";
import type { RunOutcome } from "../log.ts";
import type { PlanCheckContext, RunKind } from "../plan/validatePlan.ts";
import type { HomerState } from "../state.ts";
import type { SentRecord } from "../plan/executePlan.ts";
import type { PostPlan } from "../tools/post.ts";
import type { RunDependencies } from "./runDependencies.ts";

export type RunContext = {
  convoId: string; messages: any[]; state: HomerState; nowMs: number; homerDid: string; shortHandleByDid: Record<string, string>;
};

export type RunSharedOptions = {
  runKind: RunKind; // also the log's trigger name
  skillFile: string; // in prompts/
  dryRun: boolean;
  buildRunNotes: (context: RunContext) => string;
  // Heartbeat and @-reply: put the tagged meme catalog in the prompt and allow meme actions.
  // Left out (gm): no catalog, and the plan check rejects any meme action.
  includeMemeCatalog?: boolean;
  // Built once the run has its session and conversation (search_chat reads that conversation only).
  // Left out: the model gets no lookups.
  buildLookupTools?: (context: { session: any; convoId: string; shortHandleByDid: Record<string, string>; messages?: any[] }) => LookupTools;
  // @-reply: the message being answered. Its id is a known id for the plan check even when it is
  // older than the transcript, and the first text or meme must replyTo it.
  mentioningMessageId?: string;
  extraPlanCheckContext?: Partial<PlanCheckContext>; // welcome: the newcomer names
  convoId?: string; // @-reply: the conversation the @ came from. Left out: config.target's conversation
  // State for a finished live run (a post or a deliberate skip). Never called in dry mode or on failure.
  recordFinishedRun?: (state: HomerState, finishedAtIso: string, finished: { plan: PostPlan; sent: SentRecord[] }) => void;
  dependencies?: Partial<RunDependencies>;
};

export type RunResult = {
  outcome: RunOutcome | "paused"; // "paused": the off switch stopped it before the model call; no log
  plan: PostPlan | null;
  error: string | null;
  logPath: string | null;
  convoId: string;
};

export function composeFirstUserMessage(parts: { transcript: string; catalogText?: string; runNotes: string }): string {
  return [parts.transcript, parts.catalogText, parts.runNotes].filter(Boolean).join("\n\n");
}
