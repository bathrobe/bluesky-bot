// bluesky_user_posts: one account's public posts, through Homer's logged-in agent.
// Strictly read-only: getProfile, then getAuthorFeed (latest, portrait) or searchPosts with an author (query).
// portrait: their 10 most-engaged recent posts plus their latest 10, for when someone asks for a dactyl.
// Chat members: only someone in this run's transcript (they spoke, or their handle was typed) may be
// looked up. A member Homer cannot see in the transcript is refused. Non-members are always allowed.
import { withSessionRetry } from "../bluesky/session.ts";
import { latestPosts, portraitPosts, searchTheirPosts } from "./authorFeed.ts";
import type { LookupTool } from "../llm/toolLoop.ts";
import { formatPostBlocks } from "./searchBluesky.ts";

export type BlueskyUserPostsContext = { session: any; shortHandleByDid: Record<string, string>; messages?: any[] };

export const blueskyUserPostsToolDefinition = {
  type: "function",
  function: {
    name: "bluesky_user_posts",
    description:
      "read one bluesky account's public posts (read-only). without query: their latest 10 posts. with query: their posts matching it. " +
      "with portrait: true: their 10 most-engaged recent posts and their latest 10, for when someone asks for a dactyl. " +
      "handle is a full handle (someone.bsky.social, example.com) or the short name of someone in the transcript above. " +
      "a chat member can only be looked up if they appear in the transcript. the query leaves the chat: never put anything a member said in it.",
    parameters: {
      type: "object",
      properties: {
        handle: { type: "string", description: "whose posts: full handle, or a short name from the transcript" },
        query: { type: "string", description: "optional search words within their posts" },
        portrait: { type: "boolean", description: "true for their most-engaged and latest posts together (a dactyl request)" },
      },
      required: ["handle"],
    },
  },
};

// "@JoeTForHire" → the member's DID when the short name is a member's; else a handle to resolve.
export function actorForHandle(rawHandle: string, shortHandleByDid: Record<string, string>): string {
  const handle = rawHandle.trim().replace(/^@/, "").toLowerCase();
  if (handle.includes(".") || handle.startsWith("did:")) return handle;
  const memberDid = Object.keys(shortHandleByDid).find((did) => shortHandleByDid[did].toLowerCase() === handle);
  return memberDid ?? `${handle}.bsky.social`;
}

// True for a non-member, and for a member who sent a message in the transcript or whose handle is typed in it.
export function mayLookUp(profile: { did: string; handle?: string }, context: BlueskyUserPostsContext): boolean {
  const shortHandle = context.shortHandleByDid[profile.did];
  if (shortHandle === undefined) return true; // not in this chat
  const messages = context.messages ?? [];
  if (messages.some((message) => message.sender?.did === profile.did)) return true;
  const chatText = messages.map((message) => String(message.text ?? "")).join("\n").toLowerCase();
  const fullHandle = (profile.handle ?? "").toLowerCase();
  return chatText.includes(`@${shortHandle.toLowerCase()}`) || (fullHandle.length > 0 && chatText.includes(fullHandle));
}

export function createBlueskyUserPostsTool(context: BlueskyUserPostsContext): LookupTool {
  const { session } = context;
  async function run(parsedArguments: any) {
    const rawHandle = typeof parsedArguments?.handle === "string" ? parsedArguments.handle.trim() : "";
    if (!rawHandle) throw new Error("handle must be a non-empty string");
    const query = typeof parsedArguments?.query === "string" ? parsedArguments.query.trim() : "";
    const actor = actorForHandle(rawHandle, context.shortHandleByDid);
    const profileResponse: any = await withSessionRetry(session, () => session.agent.app.bsky.actor.getProfile({ actor }));
    const profile = profileResponse.data;
    if (!mayLookUp(profile, context)) {
      return { resultText: `@${profile.handle} is in this chat but not in the transcript you can see, so their posts are off limits this run.` };
    }
    if (parsedArguments?.portrait === true && !query) return { resultText: await portraitText(session, profile) };
    const posts = query ? await searchTheirPosts(session, profile.did, query) : await latestPosts(session, profile.did);
    const what = query ? `posts by @${profile.handle} matching "${query}"` : `latest posts by @${profile.handle}`;
    if (posts.length === 0) return { resultText: `no ${what}.` };
    const blocks = formatPostBlocks(posts);
    return { resultText: `${blocks.length} ${what}:\n${blocks.join("\n")}` };
  }
  return { definition: blueskyUserPostsToolDefinition, run };
}

async function portraitText(session: any, profile: { did: string; handle: string }): Promise<string> {
  const { top, latest, scanned } = await portraitPosts(session, profile.did);
  if (scanned === 0) return `no posts by @${profile.handle}.`;
  return [
    `most-engaged ${top.length} of the last ${scanned} posts by @${profile.handle}:`,
    ...formatPostBlocks(top),
    `latest ${latest.length} posts by @${profile.handle}:`,
    ...formatPostBlocks(latest),
  ].join("\n");
}
