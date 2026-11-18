// Lost state (item 26): a start with no state.json rebuilds `paused` and `lastHeartbeatAt` from the
// chat, queues the unanswered @ once, and never touches a state.json that is there. Fixtures only.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "./config.ts";
import { recoverLostState } from "./recovery.ts";
import { createRunQueue } from "./runs/runQueue.ts";
import { recoverStateIfLost, startUp } from "./startUp.ts";
import { readState } from "./state.ts";
import { HOMER_DID, JOE_DID, OTHER_DID, makeMentionMessage, makeMessage } from "./triggers/mentions.fixtures.ts";
import { isHeartbeatDue } from "./triggers/schedule.ts";
import { groupSchedule } from "./triggers/scheduleTestHelpers.ts";

const NOW = new Date("2026-11-14T20:00:00.000Z"); // 3pm ET, inside the heartbeat window
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const fromJoe = (id: string, text: string, minutes: number) => makeMessage({ id, text, sentAt: minutesAgo(minutes) });
const fromHomer = (id: string, minutes: number) => makeMessage({ id, text: "hi", sender: { did: HOMER_DID }, sentAt: minutesAgo(minutes) });
const convoIds = { target: TEST_DM_CONVO_ID, testDm: TEST_DM_CONVO_ID };
const recover = (testDmMessages: any[], targetConvoMessages: any[] = []) =>
  recoverLostState({ targetConvoMessages, testDmMessages, homerDid: HOMER_DID, joeDid: JOE_DID, testDmConvoId: TEST_DM_CONVO_ID });
const missingStatePath = async () => join(await mkdtemp(join(tmpdir(), "homer-recovery-")), "state.json");

describe("recoverLostState", () => {
  it("Joe's last command off -> paused; off then on -> not paused; no command -> not paused", () => {
    expect(recover([fromJoe("a", "on", 90), fromJoe("b", " OFF ", 30)]).paused).toBe(true);
    expect(recover([fromJoe("b", "on", 10), fromJoe("a", "off", 30)]).paused).toBe(false); // newest first in, still read by time
    expect(recover([fromJoe("a", "hello", 5)]).paused).toBe(false);
  });

  it("ignores `off please` and an `off` from another DID", () => {
    const otherOff = makeMessage({ id: "c", text: "off", sender: { did: OTHER_DID }, sentAt: minutesAgo(5) });
    expect(recover([fromJoe("a", "on", 60), fromJoe("b", "off please", 10), otherOff]).paused).toBe(false);
  });

  it("Homer's newest message 2 hours old -> no heartbeat due yet; no Homer message -> due", () => {
    const recovered = recover([], [fromHomer("h1", 300), fromJoe("j", "yo", 30), fromHomer("h2", 120)]);
    expect(recovered.lastHeartbeatAt).toBe(minutesAgo(120));
    expect(isHeartbeatDue({ ...recovered, lastGmAt: null, lastGmDate: null, gmMinuteToday: null }, NOW, groupSchedule)).toBe(false);
    const withoutHomer = recover([], [fromJoe("j", "yo", 30)]);
    expect(withoutHomer.lastHeartbeatAt).toBeNull();
    expect(isHeartbeatDue({ ...withoutHomer, lastGmAt: null, lastGmDate: null, gmMinuteToday: null }, NOW, groupSchedule)).toBe(true);
  });
});

describe("start-up with no state.json", () => {
  it("writes the recovered state once and queues the one unanswered @ once", async () => {
    const statePath = await missingStatePath();
    const history = [fromJoe("cmd", "off", 200), fromHomer("h1", 120), makeMentionMessage("3mention00001", HOMER_DID, { sentAt: minutesAgo(60) })];
    const fetchRecent = vi.fn(async () => history);
    const queue = createRunQueue({ runFunctions: {} as any, isPaused: async () => true, onRunFinished: () => {}, logLine: () => {} });
    const enqueueMention = vi.fn((mention: any) => queue.enqueueMention(mention));
    const options = { enqueueMention, statePath, fetchRecent, convoIds, logLine: () => {} };
    const fakeSession: any = { homerDid: HOMER_DID, homerHandle: "winedark.ink" };
    await startUp({ ...options, login: async () => fakeSession, readJoeDid: async () => JOE_DID });
    const state = await readState(statePath);
    expect(state).toMatchObject({ paused: true, lastHeartbeatAt: minutesAgo(120), pollCursor: null, memeLastUsed: {} });
    expect(enqueueMention).toHaveBeenCalledTimes(1);
    expect(enqueueMention.mock.calls[0][0].messageId).toBe("3mention00001");
    expect(fetchRecent).toHaveBeenCalledTimes(2); // recovery (DM = target, read once) + the start scan
  });

  it("leaves a present state.json untouched and reads nothing for recovery", async () => {
    const statePath = await missingStatePath();
    const savedText = JSON.stringify({ paused: false, lastHeartbeatAt: "2026-11-01T00:00:00.000Z" }) + "\n";
    await writeFile(statePath, savedText, "utf8");
    const fetchRecent = vi.fn(async () => [fromJoe("cmd", "off", 5)]);
    const recovered = await recoverStateIfLost({ session: { homerDid: HOMER_DID }, joeDid: JOE_DID, statePath, fetchRecent, convoIds });
    expect(recovered).toBeNull();
    expect(fetchRecent).not.toHaveBeenCalled();
    expect(await readFile(statePath, "utf8")).toBe(savedText);
  });
});
