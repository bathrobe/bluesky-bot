// Invented messages in the raw getMessages shapes from docs/spike-notes.md. No real DM text.
export const HOMER_DID = "did:plc:homerfixture";
export const JOE_DID = "did:plc:joefixture";
export const NOW_MS = Date.parse("2026-11-14T20:00:00.000Z");

export const shortHandleByDid = { [HOMER_DID]: "homer", [JOE_DID]: "joe" };

export function makeMessage(fields: Record<string, any>) {
  return {
    $type: "chat.bsky.convo.defs#messageView",
    rev: "rev1",
    text: "",
    sender: { did: JOE_DID },
    sentAt: "2026-11-14T19:00:00.000Z",
    reactions: [],
    ...fields,
  };
}

export function makeReaction(value: string, did: string, createdAt: string) {
  return { $type: "chat.bsky.convo.defs#reactionView", value, sender: { did }, createdAt };
}

export function makeDeleted(id: string, did: string, sentAt: string) {
  return { $type: "chat.bsky.convo.defs#deletedMessageView", id, rev: "rev1", sender: { did }, sentAt };
}

export const memeEmbed = {
  $type: "app.bsky.embed.record#view",
  record: {
    $type: "app.bsky.embed.record#viewRecord",
    uri: "at://did:plc:homerfixture/app.bsky.feed.post/3fakepost0001",
    cid: "bafyfakecid",
    author: { did: HOMER_DID, handle: "winedark.ink" },
    value: { $type: "app.bsky.feed.post", text: "" },
    embeds: [
      {
        $type: "app.bsky.embed.images#view",
        images: [{ thumb: "t", fullsize: "f", alt: "a cat wearing a tiny crown", aspectRatio: { width: 1, height: 1 } }],
      },
    ],
    indexedAt: "2026-11-14T18:00:00.000Z",
  },
};

const firstMessage = makeMessage({
  id: "3aaaaaaaaaa01",
  text: "who wants soup tonight",
  sentAt: "2026-11-14T17:00:00.000Z",
  reactions: [
    makeReaction("😂", JOE_DID, "2026-11-14T17:06:00.000Z"),
    makeReaction("👍", HOMER_DID, "2026-11-14T17:05:00.000Z"),
  ],
});

// Oldest first, as fetchRecentMessages returns them.
export const fixtureMessages = [
  firstMessage,
  makeMessage({
    id: "3aaaaaaaaaa02",
    text: "soup is a drink\nfight me",
    sender: { did: HOMER_DID },
    sentAt: "2026-11-14T18:00:00.000Z",
    replyTo: firstMessage,
  }),
  makeDeleted("3aaaaaaaaaa03", JOE_DID, "2026-11-14T18:30:00.000Z"),
  makeMessage({
    id: "3aaaaaaaaaa04",
    sender: { did: HOMER_DID },
    sentAt: "2026-11-14T19:00:00.000Z",
    embed: memeEmbed,
  }),
  makeMessage({
    id: "3aaaaaaaaaa05",
    text: "rude",
    sentAt: "2026-11-14T19:59:30.000Z",
    replyTo: makeDeleted("3aaaaaaaaaa03", JOE_DID, "2026-11-14T18:30:00.000Z"),
  }),
];
