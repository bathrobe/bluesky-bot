// Joins, the welcome plan check, epithets, and the welcome run on fakes. Invented DIDs and names.
import { describe, expect, it, vi } from "vitest";
import { keepJoinsFromAllowedConvos } from "../bluesky/poll.ts";
import { validatePlan } from "../plan/validatePlan.ts";
import { makeContext } from "../plan/validatePlanTestHelpers.ts";
import { buildTranscript } from "../transcript.ts";
import { HOMER_DID, JOE_DID, NOW_MS, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { createDefaultState } from "../state.ts";
import { epithetNoteLine, recordEpithets } from "./epithets.ts";
import { findNewcomers } from "./joins.ts";
import { buildWelcomeNotes } from "./welcomeNotes.ts";

const NEW_DID = "did:plc:newcomerfixture";
const members = { ...shortHandleByDid, [NEW_DID]: "rook" };
const joinMessage = (id: string, did: string, sentAt: string) => ({
  $type: "chat.bsky.convo.defs#systemMessageView", id, rev: "r", sentAt,
  data: { $type: "chat.bsky.convo.defs#systemMessageDataAddMember", member: { did }, role: "standard", addedBy: { did: JOE_DID } },
});
const recentJoin = joinMessage("j1", NEW_DID, "2026-11-14T19:58:00.000Z");
const newcomersOf = (messages: any[], welcomedDids: string[] = [], memberMap: Record<string, string> = members) =>
  findNewcomers({ messages, welcomedDids, shortHandleByDid: memberMap, homerDid: HOMER_DID, nowMs: NOW_MS });

describe("joins", () => {
  it("shows a join in the transcript instead of (empty)", () => {
    expect(buildTranscript([recentJoin], { nowMs: NOW_MS, shortHandleByDid: members, header: false })).toBe("[2m ago] rook joined (added by joe)   {j1}");
  });

  it("finds a recent join that has not been welcomed, and nobody else", () => {
    expect(newcomersOf([recentJoin])).toEqual([{ did: NEW_DID, shortName: "rook", joinedAt: recentJoin.sentAt }]);
    expect(newcomersOf([recentJoin], [NEW_DID])).toEqual([]); // already welcomed
    expect(newcomersOf([recentJoin], [], shortHandleByDid)).toEqual([]); // left again
    expect(newcomersOf([joinMessage("j0", NEW_DID, "2026-11-13T10:00:00.000Z")])).toEqual([]); // over a day ago
    expect(newcomersOf([joinMessage("j2", HOMER_DID, recentJoin.sentAt)])).toEqual([]); // homer himself
  });

  it("the poll passes on join events from allowed conversations only", () => {
    const logs = [
      { $type: "chat.bsky.convo.defs#logAddMember", convoId: "allowed", message: recentJoin },
      { $type: "chat.bsky.convo.defs#logMemberJoin", convoId: "elsewhere", message: recentJoin },
      { $type: "chat.bsky.convo.defs#logCreateMessage", convoId: "allowed", message: makeMessage({ id: "m1" }) },
    ];
    expect(keepJoinsFromAllowedConvos(logs, ["allowed"])).toEqual([{ convoId: "allowed", memberDid: NEW_DID }]);
  });
});

describe("validatePlan: welcome", () => {
  const welcomeContext = makeContext({ runKind: "welcome", newcomerNames: ["rook"] });
  const verse = { type: "text", text: "down from the hills came a rider\nrook, keeper of the cursed rug" };
  const plan = (body: any) => JSON.stringify({ reason: "welcome", ...body });

  it("passes one verse with an epithet for each newcomer, and a skip", () => {
    expect(validatePlan(plan({ actions: [verse], epithets: [{ member: "rook", epithet: "keeper of the cursed rug" }] }), welcomeContext).ok).toBe(true);
    expect(validatePlan(plan({ actions: [] }), welcomeContext).ok).toBe(true);
  });

  it("rejects a missing epithet, an epithet for someone else, a reply, and epithets outside the welcome run", () => {
    const errorOf = (body: any, context = welcomeContext) => { const result = validatePlan(plan(body), context); return result.ok ? "" : result.error; };
    expect(errorOf({ actions: [verse] })).toContain('no epithet for rook');
    expect(errorOf({ actions: [verse], epithets: [{ member: "rook", epithet: "x" }, { member: "joe", epithet: "y" }] })).toContain('"joe" is not one of the newcomers');
    expect(errorOf({ actions: [{ ...verse, replyTo: "3msg000000001" }], epithets: [{ member: "rook", epithet: "x" }] })).toContain("not a reply");
    expect(errorOf({ actions: [verse], epithets: [{ member: "rook", epithet: "x" }] }, makeContext())).toContain("welcome run only");
  });
});

describe("epithets", () => {
  it("keeps epithets for newcomers only, and lists them for members in the transcript", () => {
    const state = createDefaultState();
    recordEpithets(state, [{ member: "@Rook", epithet: " keeper of the cursed rug " }, { member: "joe", epithet: "nope" }], [{ did: NEW_DID, shortName: "rook" }], "2026-11-14T20:00:00.000Z");
    expect(state.epithetsByDid).toEqual({ [NEW_DID]: { shortName: "rook", epithet: "keeper of the cursed rug", givenAt: "2026-11-14T20:00:00.000Z" } });
    expect(epithetNoteLine(state.epithetsByDid, [makeMessage({ sender: { did: NEW_DID } })])).toContain('rook: "keeper of the cursed rug"');
    expect(epithetNoteLine(state.epithetsByDid, [makeMessage({})])).toBeNull();
  });

  it("the notes give display name and bio, and say what to do when they are empty", () => {
    const notes = buildWelcomeNotes({ newcomers: newcomersOf([recentJoin]), profileByDid: { [NEW_DID]: { displayName: "Rook", description: "rug\nenthusiast" } }, nowMs: NOW_MS });
    expect(notes).toContain('display name: "Rook"');
    expect(notes).toContain('bio: "rug / enthusiast"');
    expect(buildWelcomeNotes({ newcomers: newcomersOf([recentJoin]), profileByDid: {}, nowMs: NOW_MS })).toContain("bio: (empty)");
  });
});
