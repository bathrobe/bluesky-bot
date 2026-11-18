import { describe, expect, it } from "vitest";
import { HOMER_DID, JOE_DID, makeDeleted, makeMessage, memeEmbed } from "../transcript.fixtures.ts";
import { collectAllMessages, fileByUriOf, rebuildMemeLastUsed } from "./rebuildUsage.ts";

const catalogUri = memeEmbed.record.uri;
const otherUri = "at://did:plc:homerfixture/app.bsky.feed.post/3fakepost0002";
const fileByUri = fileByUriOf([
  { file: "cat-crown.jpg", description: "d", goodFor: "g", post: "p1", uri: catalogUri, cid: "c1" },
  { file: "horse.jpg", description: "d", goodFor: "g", post: "p2", uri: otherUri, cid: "c2" },
]);
const embedOf = (uri: string) => ({ ...memeEmbed, record: { ...memeEmbed.record, uri } });

describe("rebuildMemeLastUsed", () => {
  it("maps Homer's own embeds to catalog files and keeps the newest use per file", () => {
    const newestFirstPage = [
      makeMessage({ id: "h3", sender: { did: HOMER_DID }, embed: memeEmbed, sentAt: "2026-11-14T19:00:00.000Z" }),
      makeMessage({ id: "j1", sender: { did: JOE_DID }, embed: embedOf(otherUri), sentAt: "2026-11-14T18:30:00.000Z" }),
      makeMessage({ id: "h2", sender: { did: HOMER_DID }, embed: embedOf("at://elsewhere/post/9"), sentAt: "2026-11-14T18:00:00.000Z" }),
      makeMessage({ id: "h1", sender: { did: HOMER_DID }, embed: memeEmbed, sentAt: "2026-11-10T12:00:00.000Z" }),
      makeMessage({ id: "h0", sender: { did: HOMER_DID }, text: "plain text", sentAt: "2026-11-09T12:00:00.000Z" }),
      makeDeleted("d1", HOMER_DID, "2026-11-08T12:00:00.000Z"),
    ];
    expect(rebuildMemeLastUsed(newestFirstPage, HOMER_DID, fileByUri)).toEqual({ "cat-crown.jpg": "2026-11-14T19:00:00.000Z" });
    expect(rebuildMemeLastUsed([...newestFirstPage].reverse(), HOMER_DID, fileByUri)).toEqual({ "cat-crown.jpg": "2026-11-14T19:00:00.000Z" });
  });

  it("returns nothing for a chat with no meme embeds", () => {
    expect(rebuildMemeLastUsed([makeMessage({ id: "j1", text: "hi" })], HOMER_DID, fileByUri)).toEqual({});
  });
});

describe("collectAllMessages", () => {
  it("pages back with the cursor and stops on an empty page", async () => {
    const pages: Record<string, { messages: any[]; nextCursor?: string }> = {
      start: { messages: [{ id: "a" }, { id: "b" }], nextCursor: "c1" },
      c1: { messages: [{ id: "c" }], nextCursor: "c2" },
      c2: { messages: [], nextCursor: "c3" },
    };
    const cursorsAsked: (string | undefined)[] = [];
    const messages = await collectAllMessages(async (cursor) => (cursorsAsked.push(cursor), pages[cursor ?? "start"]));
    expect(messages.map((message) => message.id)).toEqual(["a", "b", "c"]);
    expect(cursorsAsked).toEqual([undefined, "c1", "c2"]);
  });

  it("stops when there is no cursor", async () => {
    const messages = await collectAllMessages(async () => ({ messages: [{ id: "a" }] }));
    expect(messages).toHaveLength(1);
  });
});
