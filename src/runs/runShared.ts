// The path every run takes: context → prompt → tool loop (with plan check) → execute → record.
// Used by the heartbeat, the gm and the @-reply. See spec.md > Run pipeline.
import { config } from "../config.ts";
import { startRunLog } from "../log.ts";
import { executePlan, summarizeLiveRun } from "../plan/executePlan.ts";
import { composeSystemPrompt } from "../prompt.ts";
import type { PostPlan } from "../tools/post.ts";
import { buildTranscript } from "../transcript.ts";
import { isDeleted } from "../transcriptParts.ts";
import { allowedRunConvoId, defaultRunDependencies, targetConvoId } from "./runDependencies.ts";
import { createPlaylistAwareSender, type ChatAction } from "../playlist/playlistActions.ts";
import { playlistNoteLine } from "../playlist/playlist.ts";
import { epithetNoteLine } from "../welcome/epithets.ts";
import { isSystemMessage } from "../welcome/joins.ts"; // a join line has an id, but it cannot be replied or reacted to
import { prepareMemeRun, recordMemeUsage } from "./runMemes.ts";
import { composeFirstUserMessage, type RunResult, type RunSharedOptions } from "./runSharedParts.ts";

export { composeFirstUserMessage, type RunContext, type RunResult, type RunSharedOptions } from "./runSharedParts.ts";

export async function runShared(options: RunSharedOptions): Promise<RunResult> {
  const dependencies = { ...defaultRunDependencies, ...options.dependencies };
  const convoId = options.convoId ? allowedRunConvoId(options.convoId) : targetConvoId(); // throws unless on the allow list
  const pausedResult: RunResult = { outcome: "paused", plan: null, error: null, logPath: null, convoId };
  if ((await dependencies.readState()).paused) return pausedResult;

  const runLog = startRunLog(options.runKind, convoId, config.model.name);
  let plan: PostPlan | null = null;
  try {
    // 1. Context
    const session = await dependencies.createSession();
    const nowMs = Date.now();
    const shortHandleByDid = await dependencies.fetchShortHandleByDid(session, convoId);
    const messages = await dependencies.fetchRecentMessages(session, convoId, { nowMs });
    const sendableMemes = options.includeMemeCatalog ? await dependencies.loadSendableMemes(session) : null;
    const state = await dependencies.readState();
    if (state.paused) return pausedResult; // second check, right before the model call
    const memeRun = sendableMemes ? prepareMemeRun({ sendableMemes, state, convoId, nowMs }) : null;
    // 2. Prompt
    const transcript = buildTranscript(messages, { nowMs, shortHandleByDid, timeZone: config.schedule.timeZone });
    const ownNotes = options.buildRunNotes({ convoId, messages, state, nowMs, homerDid: session.homerDid, shortHandleByDid });
    const sharedLines = [playlistNoteLine(state.playlist ?? [], messages), epithetNoteLine(state.epithetsByDid ?? {}, messages)].filter(Boolean);
    const hasSharedNotes = options.runKind === "heartbeat" || options.runKind === "at-reply";
    const runNotes = hasSharedNotes ? [ownNotes, ...sharedLines].join("\n") : ownNotes;
    const catalogText = memeRun?.catalogText;
    const firstUserMessage = (runLog.firstUserMessage = composeFirstUserMessage({ transcript, catalogText, runNotes }));
    // 3–4. Tool loop; every `post` goes through the plan check inside it
    const loopResult = await dependencies.runToolLoop({
      messages: [{ role: "system", content: composeSystemPrompt(options.skillFile) }, { role: "user", content: firstUserMessage }],
      planCheckContext: {
        runKind: options.runKind,
        // the mention's id counts even when the mention is older than the transcript (it is shown in the notes)
        knownMessageIds: [...messages.filter((message) => !isDeleted(message) && !isSystemMessage(message)).map((message) => message.id), ...(options.mentioningMessageId ? [options.mentioningMessageId] : [])],
        messages,
        homerDid: session.homerDid,
        mentioningMessageId: options.mentioningMessageId,
        memeUsage: memeRun?.memeUsage, // absent → every meme action is rejected
        playlistVideoIds: (state.playlist ?? []).map((song) => song.videoId),
        ...options.extraPlanCheckContext,
      },
      lookupTools: options.buildLookupTools?.({ session, convoId, shortHandleByDid, messages }),
    });
    Object.assign(runLog, { model: loopResult.model ?? runLog.model, modelTurns: loopResult.turns });
    Object.assign(runLog, { rejectedPlans: loopResult.rejectedPlans, tokens: loopResult.tokens });
    if (!loopResult.ok) throw new Error(`${loopResult.failureKind}: ${loopResult.error}`);
    plan = loopResult.plan;
    Object.assign(runLog, { finalPlan: plan, reason: plan.reason });
    // 5. Execute: dry prints; live sends each action through the Sender, which re-checks allow list and paused
    const sendContext = { session, readState: dependencies.readState };
    const sendChatAction = (action: ChatAction) => dependencies.sendPlanAction(sendContext, convoId, action, memeRun?.findMemePost);
    const sendAction = createPlaylistAwareSender({ messages, readState: dependencies.readState, updateState: dependencies.updateState, sendChatAction }); // playlist_add writes state, sends nothing
    runLog.sent = await executePlan(plan, { dryRun: options.dryRun, convoId, sendAction });
    // 6. Record. A dry run must not change what the real schedule does, so it writes no state.
    if (options.dryRun) runLog.outcome = "dry";
    else {
      Object.assign(runLog, summarizeLiveRun(plan, runLog.sent)); // outcome + any send error
      // Schedule state moves on for a post or a deliberate skip. A failed run leaves it alone (retried);
      // nothing landed in a failed run, so there is no meme usage to record either.
      if (runLog.outcome !== "failed") {
        await dependencies.updateState((stateToChange) => {
          const finishedAtIso = new Date().toISOString();
          options.recordFinishedRun?.(stateToChange, finishedAtIso, { plan: plan!, sent: runLog.sent });
          recordMemeUsage(stateToChange, convoId, runLog.sent, finishedAtIso); // only memes that landed
        });
      }
    }
  } catch (error: any) {
    Object.assign(runLog, { outcome: "failed", error: error?.message ?? String(error) });
  }
  const logPath = await dependencies.writeRunLog(runLog);
  return { outcome: runLog.outcome!, plan, error: runLog.error, logPath, convoId };
}
