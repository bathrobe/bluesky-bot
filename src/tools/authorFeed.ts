// Reading one account's own posts (read-only): latest, most-engaged, or matching a query.
// "Own" means no replies and no reposts: what they put on their profile themselves.
import { withSessionRetry } from "../bluesky/session.ts";
import { MAX_POSTS } from "./searchBluesky.ts";

const FEED_PAGE_SIZE = 100;
const MAX_FEED_PAGES = 3; // most-engaged is picked from their last ~300 posts

// likes + reposts + replies + quotes
export function engagementOf(post: any): number {
  return (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0) + (post.quoteCount ?? 0);
}

export function mostEngaged(posts: any[], count = MAX_POSTS): any[] {
  return [...posts].sort((first, second) => engagementOf(second) - engagementOf(first)).slice(0, count);
}

// Their own posts, newest first, one or more pages of getAuthorFeed.
export async function fetchOwnPosts(session: any, did: string, pages: number, pageSize = FEED_PAGE_SIZE): Promise<any[]> {
  const ownPosts: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < Math.min(pages, MAX_FEED_PAGES); page++) {
    const response: any = await withSessionRetry(session, () =>
      session.agent.app.bsky.feed.getAuthorFeed({ actor: did, limit: pageSize, filter: "posts_no_replies", ...(cursor ? { cursor } : {}) }),
    );
    const feed = response.data?.feed ?? [];
    ownPosts.push(...feed.filter((item: any) => !item.reason && item.post?.author?.did === did).map((item: any) => item.post)); // drop reposts
    cursor = response.data?.cursor;
    if (!cursor || feed.length === 0) break;
  }
  return ownPosts;
}

export async function latestPosts(session: any, did: string): Promise<any[]> {
  return (await fetchOwnPosts(session, did, 1, 30)).slice(0, MAX_POSTS);
}

// Both lists from one read: the 10 most-engaged of their recent posts, and their latest 10.
export async function portraitPosts(session: any, did: string): Promise<{ top: any[]; latest: any[]; scanned: number }> {
  const ownPosts = await fetchOwnPosts(session, did, MAX_FEED_PAGES);
  return { top: mostEngaged(ownPosts), latest: ownPosts.slice(0, MAX_POSTS), scanned: ownPosts.length };
}

export async function searchTheirPosts(session: any, did: string, query: string): Promise<any[]> {
  const response: any = await withSessionRetry(session, () =>
    session.agent.app.bsky.feed.searchPosts({ q: query, author: did, limit: MAX_POSTS, sort: "top" }),
  );
  return response.data?.posts ?? [];
}
