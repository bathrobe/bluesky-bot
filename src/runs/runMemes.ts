// The meme parts of a run: load the catalog once, tag it for this conversation, look up a
// file's post for the Sender, and record what landed. See spec.md > Meme catalog and usage.
import type { Session } from "../bluesky/session.ts";
import type { MemePostRef } from "../bluesky/send.ts";
import { findSendableMeme, loadSendableCatalog, renderCatalogForPrompt, type SendableMeme } from "../memes/catalog.ts";
import { createBlueskyPostResolver } from "../memes/resolvePosts.ts";
import { createIsMemeSpent, memeUsageForConvo, type MemeUsage } from "../memes/usage.ts";
import type { SentRecord } from "../plan/executePlan.ts";
import type { HomerState } from "../state.ts";

// Header for the catalog block in the first user message. Matches SYSTEM.md > meme discipline.
export const CATALOG_HEADER =
  "meme catalog (one per line: `file [tag] for: <good for> | shows: <description>`). " +
  "`[fresh]` = you can send it. `[spent]` = already used in this chat; rejected unless the rare on-the-nose override applies. " +
  "copy the filename exactly.";

let cachedSendableMemes: Promise<SendableMeme[]> | null = null;

// Load + resolve memes/catalog.yaml once per process. A failure is not cached, so the next run retries.
export function loadSendableMemesOnce(session: Session): Promise<SendableMeme[]> {
  cachedSendableMemes ??= loadSendableCatalog(createBlueskyPostResolver(session))
    .then((result) => result.sendableMemes)
    .catch((error) => {
      cachedSendableMemes = null;
      throw error;
    });
  return cachedSendableMemes;
}

export type MemeRun = {
  memeUsage: MemeUsage; // for the plan check
  catalogText?: string; // the tagged catalog block; undefined when nothing is sendable
  findMemePost: (file: string) => MemePostRef | undefined; // for the Sender
};

// Tags come from the same usage the plan check enforces, so `[spent]` means "will be rejected".
export function prepareMemeRun(input: { sendableMemes: SendableMeme[]; state: HomerState; convoId: string; nowMs: number }): MemeRun {
  const sendableFiles = input.sendableMemes.map((meme) => meme.file);
  const memeUsage = memeUsageForConvo(input.state, input.convoId, sendableFiles, input.nowMs);
  const isMemeSpent = createIsMemeSpent(sendableFiles, memeUsage.lastUsedByFile);
  const catalogLines = renderCatalogForPrompt(input.sendableMemes, isMemeSpent);
  return {
    memeUsage,
    catalogText: catalogLines ? `${CATALOG_HEADER}\n${catalogLines}` : undefined,
    findMemePost: (file) => {
      const meme = findSendableMeme(input.sendableMemes, file);
      return meme ? { uri: meme.uri, cid: meme.cid } : undefined;
    },
  };
}

// Only memes that landed count. A meme sent with `onTheNose` (kept only when the override was
// really used, see plan/memeRules.ts) also moves this conversation's lastOverrideAt.
export function recordMemeUsage(state: HomerState, convoId: string, sentRecords: SentRecord[], sentAtIso: string): void {
  for (const record of sentRecords) {
    if (record.action.type !== "meme" || !record.messageId || record.error) continue;
    state.memeLastUsed[convoId] = { ...state.memeLastUsed[convoId], [record.action.file]: sentAtIso };
    if (record.action.onTheNose) state.lastOverrideAtByConvo[convoId] = sentAtIso;
  }
}
