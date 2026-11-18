// search_bluesky: public post search through Homer's logged-in agent (not the chat proxy).
// Strictly read-only: one app.bsky.feed.searchPosts call, nothing else. Only the query leaves
// the process. See spec.md > Lookup tools and prd.md > Outside finds.
import { withSessionRetry } from "../bluesky/session.ts";
import type { LookupTool } from "../llm/toolLoop.ts";
import { flattenText } from "../transcriptParts.ts";

export const MAX_POSTS = 10;
const MAX_POST_TEXT_LENGTH = 300;

export const searchBlueskyToolDefinition = {
  type: "function",
  function: {
    name: "search_bluesky",
    description:
      "search public bluesky posts (read-only). returns up to 10 posts: author handle, date, likes, text, and a bsky.app link. " +
      "to share one, put its link in a text action; the chat shows a preview. the query leaves the chat: " +
      "search the topic, never a member's name, handle, or anything they said. for one person's posts use bluesky_user_posts.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "search words for the topic" } },
      required: ["query"],
    },
  },
};

// at://did/app.bsky.feed.post/rkey → https://bsky.app/profile/<handle>/post/rkey
export function postLink(post: any): string {
  const recordKey = String(post.uri ?? "").split("/").pop();
  return `https://bsky.app/profile/${post.author?.handle ?? post.author?.did}/post/${recordKey}`;
}

function shortDate(isoDate: string | undefined): string {
  if (!isoDate || Number.isNaN(Date.parse(isoDate))) return "undated";
  return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toLowerCase();
}

// Numbered blocks: header line, text, link. Shared with bluesky_user_posts.
export function formatPostBlocks(posts: any[]): string[] {
  return posts.slice(0, MAX_POSTS).map((post, index) => {
    const fullText = flattenText(post.record?.text);
    const text = fullText.length > MAX_POST_TEXT_LENGTH ? `${fullText.slice(0, MAX_POST_TEXT_LENGTH - 1)}…` : fullText;
    const hasMedia = post.embed ? " · has media" : "";
    const header = `${index + 1}. @${post.author?.handle ?? "unknown"} · ${shortDate(post.record?.createdAt)} · ${post.likeCount ?? 0} likes${hasMedia}`;
    return `${header}\n   ${text || "(no text)"}\n   ${postLink(post)}`;
  });
}

export function formatSearchBlueskyResult(query: string, posts: any[]): string {
  if (posts.length === 0) return `no bluesky posts found for "${query}".`;
  const blocks = formatPostBlocks(posts);
  return `${blocks.length} bluesky posts for "${query}":\n${blocks.join("\n")}`;
}

// `session` needs only `agent` (the logged-in AtpAgent); tests pass a fake one.
export function createSearchBlueskyTool(session: any): LookupTool {
  async function run(parsedArguments: any) {
    const query = typeof parsedArguments?.query === "string" ? parsedArguments.query.trim() : "";
    if (!query) throw new Error("query must be a non-empty string");
    const response: any = await withSessionRetry(session, () =>
      session.agent.app.bsky.feed.searchPosts({ q: query, limit: MAX_POSTS, sort: "top" }),
    );
    return { resultText: formatSearchBlueskyResult(query, response.data?.posts ?? []) };
  }
  return { definition: searchBlueskyToolDefinition, run };
}
