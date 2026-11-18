import { describe, expect, it, vi } from "vitest";
import { GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { HOMER_DID, JOE_DID, makeDeleted, makeMessage, shortHandleByDid } from "../transcript.fixtures.ts";
import { createSearchChatTool, searchChatToolDefinition, type FetchPage } from "./searchChat.ts";

// Ids are TIDs-like: zero-padded numbers sort as strings in time order. Higher = newer.
const idFor = (number: number) => `3m${String(number).padStart(5, "0")}`;
const sentAtFor = (number: number) => new Date(Date.parse("2026-10-01T12:00:00.000Z") + number * 60_000).toISOString();
const messageNumber = (number: number, text: string, did = JOE_DID) =>
  makeMessage({ id: idFor(number), text, sentAt: sentAtFor(number), sender: { did } });

// Fake getMessages: newest first, pages of `pageSize`, and (like the real API) a next cursor even
// on the last page, then an empty page.
function fakePages(newestFirst: any[], pageSize = 100) {
  const fetchPage = vi.fn<FetchPage>(async (cursor) => {
    const start = cursor ? Number(cursor) : 0;
    return { messages: newestFirst.slice(start, start + pageSize), nextCursor: String(start + pageSize) };
  });
  return fetchPage;
}
const searchWith = (fetchPage: FetchPage, maxPages = 30) =>
  createSearchChatTool({ convoId: TEST_DM_CONVO_ID, shortHandleByDid, fetchPage, maxPages, timeZone: "America/New_York" });

describe("search_chat", () => {
  it("is the tool the prompt describes: keywords required, before optional", () => {
    expect(searchChatToolDefinition.function.name).toBe("search_chat");
    expect(Object.keys(searchChatToolDefinition.function.parameters.properties)).toEqual(["keywords", "before"]);
    expect(searchChatToolDefinition.function.parameters.required).toEqual(["keywords"]);
  });

  it("matches any keyword, case-insensitive, oldest first, with sender, date, text and {id}; returns the ids", async () => {
    const messages = [messageNumber(3, "the HORSE is back"), messageNumber(2, "nothing here"), messageNumber(1, "make it smaller", HOMER_DID)];
    const result = await searchWith(fakePages(messages)).run({ keywords: ["horse", "Smaller"] });
    const lines = result.resultText.split("\n");
    expect(lines[0]).toMatch(/^2 matches for "horse", "Smaller", oldest first\. searched 3 messages, back to oct 1, 2026.*start of the chat/);
    expect(lines[1]).toBe(`[oct 1, 2026, 8:01 am] homer: make it smaller   {${idFor(1)}}`);
    expect(lines[2]).toBe(`[oct 1, 2026, 8:03 am] joe: the HORSE is back   {${idFor(3)}}`);
    expect(result.messageIds).toEqual([idFor(1), idFor(3)]);
  });

  it('says "no matches" plainly, and how far back it looked', async () => {
    const result = await searchWith(fakePages([messageNumber(1, "hello")])).run({ keywords: ["zebra"] });
    expect(result.resultText).toBe('no matches for "zebra". searched 1 messages, back to oct 1, 2026, 8:01 am (the start of the chat record).');
    expect(result.messageIds).toEqual([]);
  });

  it("pages back 100 at a time and stops on the first empty page", async () => {
    const messages = Array.from({ length: 250 }, (_, index) => messageNumber(250 - index, index === 249 ? "first ever soup" : "chatter"));
    const fetchPage = fakePages(messages);
    const result = await searchWith(fetchPage).run({ keywords: ["soup"] });
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, "100", "200", "300"]); // 4th page is empty
    expect(result.messageIds).toEqual([idFor(1)]);
  });

  it("stops at the page cap and says older messages were not searched", async () => {
    const messages = Array.from({ length: 500 }, (_, index) => messageNumber(500 - index, index === 499 ? "soup" : "chatter"));
    const fetchPage = fakePages(messages);
    const result = await searchWith(fetchPage, 3).run({ keywords: ["soup"] });
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.resultText).toMatch(/^no matches for "soup"\. searched 300 messages.*stopped at the 3-page limit/);
  });

  it("before: only messages older than that id are searched", async () => {
    const messages = [messageNumber(3, "soup three"), messageNumber(2, "soup two"), messageNumber(1, "soup one")];
    const result = await searchWith(fakePages(messages)).run({ keywords: ["soup"], before: idFor(3) });
    expect(result.messageIds).toEqual([idFor(1), idFor(2)]);
    expect(result.resultText).toContain(`searched 2 messages older than {${idFor(3)}}`);
  });

  it("skips deleted messages and matches shared-post text", async () => {
    const memeMessage = makeMessage({ id: idFor(2), sentAt: sentAtFor(2), embed: { record: { $type: "app.bsky.embed.record#viewRecord", author: { handle: "a.b" }, value: { text: "big soup energy" } } } });
    const result = await searchWith(fakePages([memeMessage, makeDeleted(idFor(1), JOE_DID, sentAtFor(1))])).run({ keywords: ["soup"] });
    expect(result.messageIds).toEqual([idFor(2)]);
    expect(result.resultText).toContain("searched 1 messages");
  });

  it("caps a flood of matches at the oldest 10 and newest 10, with a note", async () => {
    const messages = Array.from({ length: 50 }, (_, index) => messageNumber(50 - index, "lol"));
    const result = await searchWith(fakePages(messages)).run({ keywords: ["lol"] });
    expect(result.messageIds).toHaveLength(20);
    expect(result.messageIds![0]).toBe(idFor(1));
    expect(result.messageIds![19]).toBe(idFor(50));
    expect(result.resultText).toMatch(/^50 matches/);
    expect(result.resultText).toContain("… 30 more matches in between, not shown.");
  });

  it("refuses a conversation that is not on the allow list, and empty keywords", async () => {
    expect(() => createSearchChatTool({ convoId: GROUP_CONVO_ID, shortHandleByDid, fetchPage: fakePages([]) })).toThrow(/refuses/);
    await expect(searchWith(fakePages([])).run({ keywords: ["  "] })).rejects.toThrow(/keywords/);
  });
});
