// Shared fixtures for the memes tests: the fixture catalog and a fake resolver (no network).
import { join } from "node:path";
import type { PostLinkResolver, ResolvedPost } from "./resolvePosts.ts";

export const FIXTURE_CATALOG_PATH = join(import.meta.dirname, "catalog.fixture.yaml");

export const SOUP_LINK = "https://bsky.app/profile/homer.example/post/3fixture0001";
export const HORSE_LINK = "https://bsky.app/profile/homer.example/post/3fixture0002";

// Resolves only the links it was given; records every call so tests can check batching.
export function createFakeResolver(knownPosts: Record<string, ResolvedPost>) {
  const calls: string[][] = [];
  const resolvePostLinks: PostLinkResolver = async (postLinks) => {
    calls.push(postLinks);
    const resolvedPosts = new Map<string, ResolvedPost>();
    for (const postLink of postLinks) {
      if (knownPosts[postLink]) resolvedPosts.set(postLink, knownPosts[postLink]);
    }
    return resolvedPosts;
  };
  return { resolvePostLinks, calls };
}

export const bothPostsResolve = {
  [SOUP_LINK]: { uri: "at://did:plc:homerfixture/app.bsky.feed.post/3fixture0001", cid: "bafysoup" },
  [HORSE_LINK]: { uri: "at://did:plc:homerfixture/app.bsky.feed.post/3fixture0002", cid: "bafyhorse" },
};
