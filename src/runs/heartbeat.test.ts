import { describe, expect, it } from "vitest";
import { HOMER_DID, JOE_DID, NOW_MS, makeDeleted, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { assertOperatorNoteAllowed, buildHeartbeatNotes } from "./heartbeat.ts";

const homerMentionFacet = {
  $type: "app.bsky.richtext.facet",
  index: { byteStart: 0, byteEnd: 13 },
  features: [{ $type: "app.bsky.richtext.facet#mention", did: HOMER_DID }],
};
const joeSays = (id: string, text: string, sentAt: string, extra = {}) => makeMessage({ id, text, sentAt, ...extra });
const homerSays = (id: string, text: string, sentAt: string) => makeMessage({ id, text, sentAt, sender: { did: HOMER_DID } });

function notesFor(messages: any[], lastHeartbeatAt: string | null = null, extra = {}) {
  return buildHeartbeatNotes({ messages, state: { lastHeartbeatAt }, nowMs: NOW_MS, homerDid: HOMER_DID, shortHandleByDid, ...extra });
}

describe("buildHeartbeatNotes", () => {
  it("gives the time of day in Eastern time and how long since anyone spoke", () => {
    const notes = notesFor([joeSays("m1", "hello", "2026-11-14T18:00:00.000Z")]);
    expect(notes).toContain("run notes (heartbeat):");
    expect(notes).toContain("- time: sat, 3:00 pm est (afternoon).");
    expect(notes).toContain("- last message in the chat: 2h ago, from joe.");
    expect(notes).not.toContain("nobody has spoken since your last post");
  });

  it("lists what Homer already answered since the last tick, and nothing older", () => {
    const mention = joeSays("m1", "@winedark.ink hi", "2026-11-14T17:00:00.000Z");
    const answer = makeMessage({ id: "h1", text: "hi", sentAt: "2026-11-14T17:01:00.000Z", sender: { did: HOMER_DID }, replyTo: { id: "m1" } });
    expect(notesFor([mention, answer], "2026-11-14T16:00:00.000Z")).toContain("- already answered by you since your last tick: {m1}. those are closed.");
    expect(notesFor([mention, answer], "2026-11-14T17:30:00.000Z")).not.toContain("already answered");
  });

  it("counts Homer's share of the last 20 messages only", () => {
    const oldHomerMessages = Array.from({ length: 5 }, (_, index) => homerSays(`old${index}`, "x", "2026-11-14T10:00:00.000Z"));
    const recentMessages = Array.from({ length: 20 }, (_, index) =>
      index < 3 ? homerSays(`h${index}`, "x", "2026-11-14T12:00:00.000Z") : joeSays(`j${index}`, "x", "2026-11-14T13:00:00.000Z"),
    );
    expect(notesFor([...oldHomerMessages, ...recentMessages])).toContain("- 3 of the last 20 messages are yours.");
    expect(notesFor(recentMessages.slice(0, 4))).toContain("- 3 of the last 4 messages are yours.");
  });

  it("flags a message that says homer by name since the last tick", () => {
    const notes = notesFor(
      [
        joeSays("before", "homer was funny", "2026-11-14T15:00:00.000Z"),
        joeSays("after", "where is Homer today", "2026-11-14T19:00:00.000Z"),
      ],
      "2026-11-14T16:00:00.000Z",
    );
    expect(notes).toContain("someone said your name since your last tick");
    expect(notes).toContain('  - joe, 1h ago: "where is Homer today" {after}');
    expect(notes).not.toContain("{before}");
  });

  it("does not flag a real mention, Homer's own message, a longer word, or a deleted message", () => {
    const notes = notesFor(
      [
        joeSays("mention", "@winedark.ink homer hello", "2026-11-14T19:00:00.000Z", { facets: [homerMentionFacet] }),
        homerSays("own", "homer here", "2026-11-14T19:10:00.000Z"),
        joeSays("word", "a homeric effort", "2026-11-14T19:20:00.000Z"),
        makeDeleted("gone", JOE_DID, "2026-11-14T19:30:00.000Z"),
      ],
      "2026-11-14T16:00:00.000Z",
    );
    expect(notes).not.toContain("someone said your name");
  });

  it("still flags his name when the mention facet is for someone else", () => {
    const otherFacet = { ...homerMentionFacet, features: [{ ...homerMentionFacet.features[0], did: "did:plc:other" }] };
    const notes = notesFor([joeSays("m1", "@other homer said so", "2026-11-14T19:00:00.000Z", { facets: [otherFacet] })]);
    expect(notes).toContain("{m1}");
  });

  it("with no recorded tick, counts name messages after Homer's newest message", () => {
    const notes = notesFor([
      joeSays("early", "homer?", "2026-11-14T15:00:00.000Z"),
      homerSays("reply", "yes", "2026-11-14T16:00:00.000Z"),
      joeSays("late", "thanks homer", "2026-11-14T17:00:00.000Z"),
    ]);
    expect(notes).toContain("{late}");
    expect(notes).not.toContain("{early}");
  });

  it("says nobody has spoken since his last post when his message is newest", () => {
    const notes = notesFor([joeSays("m1", "hi", "2026-11-14T15:00:00.000Z"), homerSays("m2", "hello", "2026-11-14T17:00:00.000Z")]);
    expect(notes).toContain("- last message in the chat: 3h ago, from you.");
    expect(notes).toContain("- nobody has spoken since your last post.");
  });

  it("handles an empty chat and appends the operator note last", () => {
    const notes = notesFor([], null, { operatorNote: "drop a meme this time" });
    expect(notes).toContain("- nobody has spoken in the last 7 days.");
    expect(notes.endsWith("- note from joe (your operator) for this run: drop a meme this time")).toBe(true);
  });
});

describe("assertOperatorNoteAllowed", () => {
  it("refuses a note when the target is the group, allows it for the dm", () => {
    expect(() => assertOperatorNoteAllowed("hi", "group")).toThrow(/refused while target is group/);
    expect(() => assertOperatorNoteAllowed("hi", "dm")).not.toThrow();
    expect(() => assertOperatorNoteAllowed(undefined, "group")).not.toThrow();
  });
});
