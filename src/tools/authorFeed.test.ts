// Portrait reads: most-engaged and latest from the same pages of their own posts.
import { describe, expect, it, vi } from "vitest";
import { engagementOf, mostEngaged, portraitPosts } from "./authorFeed.ts";
import { createBlueskyUserPostsTool } from "./blueskyUserPosts.ts";

const DID = "did:plc:poet";
const postWith = (rkey: string, likeCount: number, extra: any = {}) => ({
  uri: `at://${DID}/app.bsky.feed.post/${rkey}`,
  author: { did: DID, handle: "poet.bsky.social" },
  record: { text: `post ${rkey}`, createdAt: "2026-11-10T15:00:00.000Z" },
  likeCount,
  ...extra,
});

function fakeSession(pages: any[][]) {
  const getAuthorFeed = vi.fn(async ({ cursor }: any) => {
    const pageIndex = cursor ? Number(cursor) : 0;
    const nextCursor = pageIndex + 1 < pages.length ? String(pageIndex + 1) : undefined;
    return { data: { feed: pages[pageIndex].map((post) => ({ post })), cursor: nextCursor } };
  });
  const getProfile = vi.fn(async () => ({ data: { did: DID, handle: "poet.bsky.social" } }));
  return { session: { agent: { app: { bsky: { actor: { getProfile }, feed: { getAuthorFeed } } } } }, getAuthorFeed };
}

describe("authorFeed", () => {
  it("engagement counts likes, reposts, replies and quotes", () => {
    expect(engagementOf(postWith("a", 2, { repostCount: 3, replyCount: 4, quoteCount: 1 }))).toBe(10);
    expect(mostEngaged([postWith("a", 1), postWith("b", 9), postWith("c", 5)], 2).map((post) => post.likeCount)).toEqual([9, 5]);
  });

  it("portrait pages through up to 3 pages and ranks across all of them", async () => {
    const pages = [[postWith("new1", 1), postWith("new2", 2)], [postWith("old1", 50)], [postWith("older", 7)], [postWith("never", 999)]];
    const fake = fakeSession(pages);
    const { top, latest, scanned } = await portraitPosts(fake.session, DID);
    expect(fake.getAuthorFeed).toHaveBeenCalledTimes(3);
    expect(scanned).toBe(4);
    expect(top[0].likeCount).toBe(50);
    expect(latest.map((post) => post.record.text)).toEqual(["post new1", "post new2", "post old1", "post older"]);
  });

  it("the tool's portrait mode returns both lists", async () => {
    const fake = fakeSession([[postWith("x", 1), postWith("y", 8)]]);
    const tool = createBlueskyUserPostsTool({ session: fake.session, shortHandleByDid: {}, messages: [] });
    const { resultText } = await tool.run({ handle: "poet.bsky.social", portrait: true });
    expect(resultText).toMatch(/^most-engaged 2 of the last 2 posts by @poet\.bsky\.social:\n1\. .* 8 likes/);
    expect(resultText).toContain("latest 2 posts by @poet.bsky.social:\n1. @poet.bsky.social · nov 10, 2026 · 1 likes");
  });
});
