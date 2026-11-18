// bluesky_user_posts: read-only, and a chat member is only looked up when the transcript shows them.
import { describe, expect, it, vi } from "vitest";
import { actorForHandle, createBlueskyUserPostsTool, mayLookUp } from "./blueskyUserPosts.ts";

const SPEAKER_DID = "did:plc:speaker";
const SILENT_DID = "did:plc:silent";
const shortHandleByDid = { "did:plc:homer": "homer", [SPEAKER_DID]: "speaker", [SILENT_DID]: "silent" };
const handleByDid: Record<string, string> = { [SPEAKER_DID]: "speaker.example.com", [SILENT_DID]: "silent.bsky.social", "did:plc:outsider": "outsider.bsky.social" };
const didByActor = (actor: string) => Object.keys(handleByDid).find((did) => did === actor || handleByDid[did] === actor);

const postBy = (did: string, rkey: string, text: string) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`,
  author: { did, handle: handleByDid[did] },
  record: { text, createdAt: "2026-11-10T15:00:00.000Z" },
  likeCount: 3,
});

function fakeContext(messages: any[], feed: any[] = [], searchResults: any[] = []) {
  const getProfile = vi.fn(async ({ actor }: any) => {
    const did = didByActor(actor);
    if (!did) throw new Error("Profile not found");
    return { data: { did, handle: handleByDid[did] } };
  });
  const getAuthorFeed = vi.fn(async (_params: any) => ({ data: { feed } }));
  const searchPosts = vi.fn(async (_params: any) => ({ data: { posts: searchResults } }));
  const session = { agent: { app: { bsky: { actor: { getProfile }, feed: { getAuthorFeed, searchPosts } } } } };
  return { context: { session, shortHandleByDid, messages }, getProfile, getAuthorFeed, searchPosts };
}

const fromSpeaker = { id: "m1", text: "hello", sender: { did: SPEAKER_DID } };

describe("bluesky_user_posts", () => {
  it("turns a member's short name into their DID, and anything else into a handle", () => {
    expect(actorForHandle("@Speaker", shortHandleByDid)).toBe(SPEAKER_DID);
    expect(actorForHandle("outsider", shortHandleByDid)).toBe("outsider.bsky.social");
    expect(actorForHandle("@Example.com", shortHandleByDid)).toBe("example.com");
  });

  it("latest posts: skips reposts, formats like search, keeps the link", async () => {
    const feed = [{ post: postBy(SPEAKER_DID, "3kaaa", "own post") }, { post: postBy("did:plc:outsider", "3kbbb", "reposted"), reason: { $type: "app.bsky.feed.defs#reasonRepost" } }];
    const fake = fakeContext([fromSpeaker], feed);
    const result = await createBlueskyUserPostsTool(fake.context).run({ handle: "speaker" });
    expect(fake.getAuthorFeed).toHaveBeenCalledWith({ actor: SPEAKER_DID, limit: 30, filter: "posts_no_replies" });
    expect(result.resultText).toBe(
      ["1 latest posts by @speaker.example.com:", "1. @speaker.example.com · nov 10, 2026 · 3 likes", "   own post", "   https://bsky.app/profile/speaker.example.com/post/3kaaa"].join("\n"),
    );
  });

  it("with a query it searches that author's posts only", async () => {
    const fake = fakeContext([], [], [postBy("did:plc:outsider", "3kccc", "soup")]);
    const result = await createBlueskyUserPostsTool(fake.context).run({ handle: "outsider.bsky.social", query: " soup " });
    expect(fake.searchPosts).toHaveBeenCalledWith({ q: "soup", author: "did:plc:outsider", limit: 10, sort: "top" });
    expect(fake.getAuthorFeed).not.toHaveBeenCalled();
    expect(result.resultText).toMatch(/^1 posts by @outsider\.bsky\.social matching "soup":/);
  });

  it("refuses a member who is not in the transcript, by short name or full handle, without reading their posts", async () => {
    const fake = fakeContext([fromSpeaker]);
    for (const handle of ["silent", "silent.bsky.social"]) {
      const result = await createBlueskyUserPostsTool(fake.context).run({ handle });
      expect(result.resultText).toContain("off limits");
    }
    expect(fake.getAuthorFeed).not.toHaveBeenCalled();
    expect(fake.searchPosts).not.toHaveBeenCalled();
  });

  it("a member counts as in the transcript when they spoke or their handle was typed", () => {
    const silent = { did: SILENT_DID, handle: "silent.bsky.social" };
    expect(mayLookUp(silent, { session: null, shortHandleByDid, messages: [fromSpeaker] })).toBe(false);
    expect(mayLookUp(silent, { session: null, shortHandleByDid, messages: [{ text: "what is @silent.bsky.social posting", sender: { did: SPEAKER_DID } }] })).toBe(true);
    expect(mayLookUp({ did: SPEAKER_DID }, { session: null, shortHandleByDid, messages: [fromSpeaker] })).toBe(true);
    expect(mayLookUp({ did: "did:plc:outsider" }, { session: null, shortHandleByDid, messages: [] })).toBe(true);
  });

  it("an empty handle, an unknown account and an empty feed all come back plainly", async () => {
    const fake = fakeContext([]);
    await expect(createBlueskyUserPostsTool(fake.context).run({ handle: " " })).rejects.toThrow(/handle/);
    await expect(createBlueskyUserPostsTool(fake.context).run({ handle: "nobody.example" })).rejects.toThrow(/not found/);
    expect((await createBlueskyUserPostsTool(fake.context).run({ handle: "outsider" })).resultText).toBe("no latest posts by @outsider.bsky.social.");
  });
});
