// The welcome run (prompts/welcome.md): a newcomer gets two lines of hexameter that name them with a
// Homeric epithet, built from their public display name and bio. The epithet is kept (welcome/epithets.ts).
// Triggered by a join event in the poll (main.ts), a couple of minutes later so a batch of joins gets one
// welcome. Before the model: fresh history → who joined and is not welcomed yet. Nobody → no run.
// Everyone found is marked welcomed after a finished run, sent or skipped, so nobody is welcomed twice.
import { withSessionRetry } from "../bluesky/session.ts";
import { config } from "../config.ts";
import { recordEpithets } from "../welcome/epithets.ts";
import { findNewcomers, type Newcomer } from "../welcome/joins.ts";
import { buildWelcomeNotes, type NewcomerProfile } from "../welcome/welcomeNotes.ts";
import { defaultRunDependencies, targetConvoId } from "./runDependencies.ts";
import { runShared, type RunResult, type RunSharedOptions } from "./runShared.ts";

export type RunWelcomeOptions = {
  dryRun: boolean;
  dependencies?: RunSharedOptions["dependencies"] & { fetchProfiles?: typeof fetchProfiles };
  treatAsNewDids?: string[]; // dry runs only (scripts/welcome.ts): welcome these members as if they just joined
};

export async function fetchProfiles(session: any, dids: string[]): Promise<Record<string, NewcomerProfile>> {
  const response: any = await withSessionRetry(session, () => session.agent.app.bsky.actor.getProfiles({ actors: dids }));
  return Object.fromEntries((response.data?.profiles ?? []).map((profile: any) => [profile.did, { displayName: profile.displayName, description: profile.description }]));
}

export async function runWelcome(options: RunWelcomeOptions): Promise<RunResult | { outcome: "nobody-new"; convoId: string }> {
  if (options.treatAsNewDids && !options.dryRun) throw new Error("treatAsNewDids is for dry runs only");
  const dependencies = { ...defaultRunDependencies, fetchProfiles, ...options.dependencies };
  const convoId = targetConvoId();
  const session = await dependencies.createSession();
  const nowMs = Date.now();
  const state = await dependencies.readState();
  const shortHandleByDid = await dependencies.fetchShortHandleByDid(session, convoId);
  const messages = await dependencies.fetchRecentMessages(session, convoId, { nowMs });
  const newcomers: Newcomer[] = options.treatAsNewDids
    ? options.treatAsNewDids.map((did) => ({ did, shortName: shortHandleByDid[did] ?? did, joinedAt: new Date(nowMs).toISOString() }))
    : findNewcomers({ messages, welcomedDids: state.welcomedDids, shortHandleByDid, homerDid: session.homerDid, nowMs });
  if (newcomers.length === 0) return { outcome: "nobody-new", convoId };
  const profileByDid = await dependencies.fetchProfiles(session, newcomers.map((newcomer) => newcomer.did));

  return runShared({
    runKind: "welcome",
    skillFile: "welcome.md",
    dryRun: options.dryRun,
    dependencies: { ...options.dependencies, createSession: async () => session }, // one login per run
    extraPlanCheckContext: { newcomerNames: newcomers.map((newcomer) => newcomer.shortName) },
    buildRunNotes: () => buildWelcomeNotes({ newcomers, profileByDid, nowMs, timeZone: config.schedule.timeZone }),
    recordFinishedRun: (stateToChange, finishedAtIso, finished) => {
      stateToChange.welcomedDids.push(...newcomers.map((newcomer) => newcomer.did));
      const verseLanded = finished.sent.some((record) => record.action.type === "text" && record.messageId && !record.error);
      if (verseLanded) recordEpithets(stateToChange, finished.plan.epithets ?? [], newcomers, finishedAtIso);
    },
  });
}
