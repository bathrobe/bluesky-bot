// The pure and read-only pieces around the @-reply run: the notes, the history fetch back to an @,
// and the start-up scan. Fixture messages only; no network.
import { describe, expect, it, vi } from "vitest";
import { fetchMessagesBackTo } from "../bluesky/history.ts";
import { GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { HOMER_DID, NOW_MS, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { findMentionsLeftUnanswered } from "../triggers/mentionsCatchUp.ts";
import { mentionMessage } from "./atReply.fakes.ts";
import { buildAtReplyNotes } from "./atReplyNotes.ts";

describe("buildAtReplyNotes", () => {
  const notesFor = (mention: any, messages: any[], budgetDecision: "answer" | "brush-off" = "answer") =>
    buildAtReplyNotes({ messages, mentionMessage: mention, budgetDecision, nowMs: NOW_MS, homerDid: HOMER_DID, shortHandleByDid });

  it("shows the mention with sender, age, text and id, and how much came after it", () => {
    const mention = mentionMessage("3mention00001", "2026-11-14T19:55:00.000Z");
    const later = makeMessage({ id: "3later0000001", text: "x", sender: { did: HOMER_DID }, sentAt: "2026-11-14T19:58:00.000Z" });
    expect(notesFor(mention, [mention, later])).toBe(
      [
        "run notes (@-reply):",
        "- time: sat, 3:00 pm est (afternoon).",
        "- joe mentioned you. this run answers that one message and nothing else:",
        '  - joe, 5m ago: "@winedark.ink hello" {3mention00001}',
        "- it is in the transcript above. 1 messages came after it (1 yours).",
        '- your first text or meme must have replyTo "3mention00001".',
      ].join("\n"),
    );
  });

  it("an old @ outside the transcript says so, and that it may be skipped; a brush-off adds its line", () => {
    const oldNotes = notesFor(mentionMessage("3mention00001", "2026-11-05T20:00:00.000Z"), [], "brush-off");
    expect(oldNotes).toContain('  - joe, 9d ago: "@winedark.ink hello" {3mention00001}');
    expect(oldNotes).toContain("- it is older than the transcript above, so it is shown only here.");
    expect(oldNotes).toContain("- this @ is old (9d ago): you were away when it came in. answer it late, or skip on purpose");
    expect(oldNotes).toContain("- brush-off: you already answered 4 @s here in the last 15 minutes.");
  });
});

describe("fetchMessagesBackTo", () => {
  const at = (minute: string) => `2026-11-14T19:${minute}:00.000Z`;
  const pages: Record<string, any> = {
    start: { messages: [makeMessage({ id: "m4", sentAt: at("40") }), makeMessage({ id: "m3", sentAt: at("30") })], cursor: "page2" },
    page2: { messages: [makeMessage({ id: "m2", sentAt: at("20") }), makeMessage({ id: "m1", sentAt: at("10") })], cursor: "page3" },
    page3: { messages: [makeMessage({ id: "m0", sentAt: at("00") })], cursor: undefined },
  };
  const getMessages = vi.fn(async ({ cursor }: any) => ({ data: pages[cursor ?? "start"] }));
  const session: any = { chatAgent: { chat: { bsky: { convo: { getMessages } } } } };

  it("pages back until it passes the @'s send time, oldest first; says when the page cap ran out first", async () => {
    const reached = await fetchMessagesBackTo(session, TEST_DM_CONVO_ID, Date.parse(at("20")));
    expect(reached).toMatchObject({ reachedStart: true });
    expect(reached.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect((await fetchMessagesBackTo(session, TEST_DM_CONVO_ID, 0)).reachedStart).toBe(true); // the conversation's start
    expect((await fetchMessagesBackTo(session, TEST_DM_CONVO_ID, 0, 2)).reachedStart).toBe(false);
  });
});

describe("findMentionsLeftUnanswered (the start-up scan)", () => {
  it("finds unanswered @s oldest first, skips answered and skipped ones, and reads only allowed @-reply conversations", async () => {
    const [older, newer, answered, skipped] = ["01", "02", "03", "04"].map((n) => mentionMessage(`3mention000${n}`, `2026-11-14T19:${n}:00.000Z`));
    const homerReply = makeMessage({ id: "3homerreply01", sender: { did: HOMER_DID }, replyTo: { id: answered.id } });
    const fetchRecent = vi.fn(async () => [newer, answered, homerReply, skipped, older]);
    const found = await findMentionsLeftUnanswered({
      session: { homerDid: HOMER_DID },
      skippedMentionIds: [skipped.id],
      atReplyConvoIds: [TEST_DM_CONVO_ID, GROUP_CONVO_ID], // as after item 30, but the group is not on the allow list
      allowedConvoIds: [TEST_DM_CONVO_ID],
      fetchRecent,
    });
    expect(found.map((mention) => mention.messageId)).toEqual([older.id, newer.id]);
    expect(fetchRecent.mock.calls.map((call: any[]) => call[1])).toEqual([TEST_DM_CONVO_ID]);
  });
});
