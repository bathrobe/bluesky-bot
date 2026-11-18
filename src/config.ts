// Every setting Homer reads. Secrets come from .env (loaded by `--env-file`), never from here.
import { homedir } from "node:os";
import { join } from "node:path";

export const TEST_DM_CONVO_ID = "3myzmduu7x32v"; // Homer + @joetforhire.com
export const GROUP_CONVO_ID = "3myuetafuyt2i"; // NOT allowed until scripts/acceptGroup.ts runs

export const config = {
  testDmConvoId: TEST_DM_CONVO_ID,
  groupConvoId: GROUP_CONVO_ID,
  // The Sender refuses any conversation not on this list. The group joins it only at launch.
  allowedConvoIds: [TEST_DM_CONVO_ID] as string[],
  // Conversations where a real @ of Homer starts an @-reply run. The group was added on 2026-11-14 (item 30).
  // Sends still go through the allow list, so the group only works once state.json has the launch record.
  atReplyConvoIds: [TEST_DM_CONVO_ID, GROUP_CONVO_ID] as string[],
  target: "dm" as "dm" | "group",
  launchThemeUntil: null as string | null, // fallback only: the live value is state.json's launchThemeUntil (set by acceptGroup.ts)

  memeCatalogPath: "memes/catalog.yaml", // relative to the repo root (where pnpm runs)
  memeFolder: join(homedir(), "Pictures", "Memes"), // the image files; checkCatalog looks here

  memeCooldown: {
    freshAgainFraction: 0.25, // once every meme is used, this share (least recently used) is fresh again
    onTheNoseMinDaysSinceUse: 30, // override: the meme was last used more than this many days ago
    onTheNoseMinDaysBetweenOverrides: 7, // override: at most one per conversation in this many days
  },

  model: {
    baseUrl: "https://gateway.inference.coop/v1",
    name: "tinfoil/deepseek-v4-1-flash",
    timeoutMs: 120_000,
    attempts: 2,
    maxTurns: 8,
  },

  caps: {
    messagesPerRun: 5, // text + meme actions
    reactionsPerRun: 3,
    lookupsPerRun: 4,
    heartbeatMinOtherMessages: 4, // fewer than this from other people since Homer last spoke: the heartbeat may only react
    searchChatPagesPerCall: 30,
    atRepliesPerWindow: 4, // full answers per conversation per window; the next @ gets one brush-off, then skips
    atReplyWindowMinutes: 15,
    secondsBetweenAtReplies: 60,
    atReplyRetryWaitMinutes: [2, 10], // a failed @-reply run is tried again after 2 min, then 10; a third failure alerts Joe
    historyMessages: 100,
    historyMaxAgeDays: 7,
  },

  schedule: {
    timeZone: "America/New_York",
    pollSeconds: 30,
    scheduleCheckSeconds: 60,
    heartbeatEveryHours: 2, // always used when target is "group". was 5 until 2026-11-15; 2 "for now"
    heartbeatIntervalMinutes: 120, // DM only: lower it (e.g. 3) to test; ignored in the group
    heartbeatWindowStart: "06:30",
    heartbeatWindowEnd: "24:00",
    gmWindowStart: "07:00",
    gmWindowEnd: "09:00",
    gmLatest: "10:00",
    hoursBetweenGmAndHeartbeat: 1,
    failedAttemptsPerWindow: 3,
  },
};

export function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

// Joe's DID is not hardcoded: it is the member of the test DM who is not Homer.
// getConvo returns metadata only (members, status), no message text.
export async function readJoeDidFromTestDm(chatAgent: any, homerDid: string): Promise<string> {
  const response = await chatAgent.chat.bsky.convo.getConvo({ convoId: TEST_DM_CONVO_ID });
  const otherMembers = response.data.convo.members.filter((member: any) => member.did !== homerDid);
  if (otherMembers.length !== 1) {
    throw new Error(`Expected one other member in the test DM, found ${otherMembers.length}`);
  }
  return otherMembers[0].did;
}
