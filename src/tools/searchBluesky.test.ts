import { describe, expect, it, vi } from "vitest";
import { createSearchBlueskyTool, searchBlueskyToolDefinition } from "./searchBluesky.ts";

const fakePost = (rkey: string, handle: string, text: string, extra = {}) => ({
  uri: `at://did:plc:${handle}/app.bsky.feed.post/${rkey}`,
  author: { did: `did:plc:${handle}`, handle },
  record: { text, createdAt: "2026-11-10T15:00:00.000Z" },
  likeCount: 12,
  ...extra,
});

// A fake logged-in agent with only the one read call search_bluesky may use.
function fakeSession(posts: any[]) {
  const searchPosts = vi.fn(async (_params: any) => ({ data: { posts } }));
  return { session: { agent: { app: { bsky: { feed: { searchPosts } } } } }, searchPosts };
}

describe("search_bluesky", () => {
  it("is the tool the prompt describes: query required", () => {
    expect(searchBlueskyToolDefinition.function.name).toBe("search_bluesky");
    expect(searchBlueskyToolDefinition.function.parameters.required).toEqual(["query"]);
  });

  it("asks searchPosts for up to 10 and formats handle, text and bsky.app link", async () => {
    const { session, searchPosts } = fakeSession([
      fakePost("3kabc", "horsefan.bsky.social", "a horse\nin a field"),
      fakePost("3kdef", "stable.example.com", "", { likeCount: undefined, embed: { $type: "app.bsky.embed.images#view" } }),
    ]);
    const result = await createSearchBlueskyTool(session).run({ query: " horses " });
    expect(searchPosts).toHaveBeenCalledWith({ q: "horses", limit: 10, sort: "top" });
    expect(result.resultText).toBe(
      [
        '2 bluesky posts for "horses":',
        "1. @horsefan.bsky.social · nov 10, 2026 · 12 likes",
        "   a horse / in a field",
        "   https://bsky.app/profile/horsefan.bsky.social/post/3kabc",
        "2. @stable.example.com · nov 10, 2026 · 0 likes · has media",
        "   (no text)",
        "   https://bsky.app/profile/stable.example.com/post/3kdef",
      ].join("\n"),
    );
    expect(result).not.toHaveProperty("messageIds"); // public posts are never chat message ids
  });

  it("shows at most 10 posts and says so plainly when there are none", async () => {
    const many = Array.from({ length: 12 }, (_, index) => fakePost(`r${index}`, "a.b", "x"));
    expect((await createSearchBlueskyTool(fakeSession(many).session).run({ query: "x" })).resultText).toMatch(/^10 bluesky posts/);
    expect((await createSearchBlueskyTool(fakeSession([]).session).run({ query: "zebra" })).resultText).toBe('no bluesky posts found for "zebra".');
  });

  it("refuses an empty query without calling the network", async () => {
    const { session, searchPosts } = fakeSession([]);
    await expect(createSearchBlueskyTool(session).run({ query: "" })).rejects.toThrow(/query/);
    expect(searchPosts).not.toHaveBeenCalled();
  });
});
