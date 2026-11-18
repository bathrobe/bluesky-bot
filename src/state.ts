// state.json: the little Homer must remember between runs. See spec.md > Data and state.
// Read with defaults (a missing file is a fresh start); write to a temp file, then rename,
// so a crash mid-write can never leave a half-written state.json.
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const defaultStatePath = join(repoRoot, "state.json");

export type HomerState = {
  pollCursor: string | null; // getLog cursor; null = start from now
  lastHeartbeatAt: string | null; // ISO time of the last finished heartbeat
  lastGmDate: string | null; // ET date (YYYY-MM-DD) of the last gm
  lastGmAt: string | null; // ISO time of the last finished gm (the heartbeat keeps 1 hour away from it)
  gmMinuteToday: { date: string; minute: string } | null; // today's random gm time, e.g. "07:42"
  paused: boolean; // off switch
  skippedMentionIds: string[]; // @s deliberately not answered
  atReplyTimesByConvo: Record<string, string[]>; // ISO times of answered @s, for the budget
  memeLastUsed: Record<string, Record<string, string>>; // convoId -> meme file -> ISO time
  lastOverrideAtByConvo: Record<string, string>; // convoId -> ISO time of last on-the-nose override
  lastAlertDate: string | null; // ET date of the last operator alert (one per day)
  failedAttemptsByTrigger: Record<string, number>; // e.g. { heartbeat: 1 } in the current window
  launchThemeUntil: string | null; // launch brief on while this date is in the future (beats config's)
  welcomedDids: string[]; // members the welcome run has named (runs/welcome.ts)
  epithetsByDid: Record<string, { shortName: string; epithet: string; givenAt: string }>; // welcome/epithets.ts
  playlist: { videoId: string; title: string; addedAt: string }[]; // the tengri playlist (playlist/playlist.ts)
  groupLaunchedAt: string | null; // the launch record (launch/launchRecord.ts). Written ONLY by scripts/acceptGroup.ts
};

export function createDefaultState(): HomerState {
  return {
    pollCursor: null,
    lastHeartbeatAt: null,
    lastGmDate: null,
    lastGmAt: null,
    gmMinuteToday: null,
    paused: false,
    skippedMentionIds: [],
    atReplyTimesByConvo: {},
    memeLastUsed: {},
    lastOverrideAtByConvo: {},
    lastAlertDate: null,
    failedAttemptsByTrigger: {},
    launchThemeUntil: null,
    welcomedDids: [],
    epithetsByDid: {},
    playlist: [],
    groupLaunchedAt: null,
  };
}

// Missing file -> defaults. Fields missing from an older file -> their defaults.
// A file that exists but is not valid JSON throws: better to stop than to forget `paused`.
export async function readState(statePath = defaultStatePath): Promise<HomerState> {
  let fileText: string;
  try {
    fileText = await readFile(statePath, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return createDefaultState();
    throw error;
  }
  const savedFields = JSON.parse(fileText);
  return { ...createDefaultState(), ...savedFields };
}

// Lost-state recovery (startUp.ts) runs only when this is false; a present file is never overridden.
export async function stateFileExists(statePath = defaultStatePath): Promise<boolean> {
  return access(statePath).then(() => true, () => false);
}

export async function writeState(state: HomerState, statePath = defaultStatePath): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await rename(temporaryPath, statePath); // atomic on the same filesystem
}

// Read, change, write in one step: `await updateState(state => { state.paused = true })`.
// Updates in this process run one after another: the poll loop and a run both write state.json,
// and two overlapping read-change-writes would lose one of the changes.
let previousUpdate: Promise<unknown> = Promise.resolve();

export function updateState(
  changeState: (state: HomerState) => void,
  statePath = defaultStatePath,
): Promise<HomerState> {
  const thisUpdate = previousUpdate.then(async () => {
    const state = await readState(statePath);
    changeState(state);
    await writeState(state, statePath);
    return state;
  });
  previousUpdate = thisUpdate.catch(() => {}); // a failed update must not block the next one
  return thisUpdate;
}
