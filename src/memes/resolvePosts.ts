// Turn bsky.app post links into URI + CID. Read-only: resolveHandle and getPosts only.
// See docs/spike-notes.md > Embed send.
import { withSessionRetry, type Session } from "../bluesky/session.ts";

export type ResolvedPost = { uri: string; cid: string };
// Takes links, returns the ones that resolved. A link missing from the map did not resolve.
export type PostLinkResolver = (postLinks: string[]) => Promise<Map<string, ResolvedPost>>;

const POST_LINK_PATTERN = /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)\/?$/;
const POSTS_PER_GET_POSTS_CALL = 25;

export function parsePostLink(postLink: string): { handleOrDid: string; recordKey: string } | null {
  const match = postLink.match(POST_LINK_PATTERN);
  return match ? { handleOrDid: match[1], recordKey: match[2] } : null;
}

export function createBlueskyPostResolver(session: Session): PostLinkResolver {
  return async (postLinks) => {
    const didByHandle = new Map<string, string | null>();
    const linkByUri = new Map<string, string>();

    for (const postLink of postLinks) {
      const parsedLink = parsePostLink(postLink);
      if (!parsedLink) continue;
      const authorDid = await resolveAuthorDid(session, parsedLink.handleOrDid, didByHandle);
      if (!authorDid) continue;
      linkByUri.set(`at://${authorDid}/app.bsky.feed.post/${parsedLink.recordKey}`, postLink);
    }

    const resolvedPosts = new Map<string, ResolvedPost>();
    const allUris = [...linkByUri.keys()];
    for (let start = 0; start < allUris.length; start += POSTS_PER_GET_POSTS_CALL) {
      const batchUris = allUris.slice(start, start + POSTS_PER_GET_POSTS_CALL);
      const response: any = await withSessionRetry(session, () => session.agent.getPosts({ uris: batchUris }));
      for (const post of response.data.posts) {
        const postLink = linkByUri.get(post.uri);
        if (postLink) resolvedPosts.set(postLink, { uri: post.uri, cid: post.cid });
      }
    }
    return resolvedPosts;
  };
}

// Each handle is resolved once per call (all of Homer's memes are on one handle).
async function resolveAuthorDid(session: Session, handleOrDid: string, didByHandle: Map<string, string | null>) {
  if (handleOrDid.startsWith("did:")) return handleOrDid;
  if (!didByHandle.has(handleOrDid)) {
    try {
      const response: any = await withSessionRetry(session, () =>
        session.agent.resolveHandle({ handle: handleOrDid }),
      );
      didByHandle.set(handleOrDid, response.data.did);
    } catch {
      didByHandle.set(handleOrDid, null);
    }
  }
  return didByHandle.get(handleOrDid) ?? null;
}
