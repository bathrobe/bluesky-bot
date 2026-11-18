// Builds the chat message for a `text` action. The API sends text exactly as given, so what the app
// does for a person has to be done here:
//   - every URL gets a link facet, so it is clickable;
//   - a bsky.app post link becomes the message's embed (the post card), and that URL leaves the text.
// A chat message holds one embed, so only the first post link is embedded (the plan check allows one).
// Read-only: resolving a post is resolveHandle + getPosts. If it fails, the link stays in the text.
import { createBlueskyPostResolver, type PostLinkResolver } from "../memes/resolvePosts.ts";
import { buildLinkFacets, extractLabeledLinks, findPostLinks, removeLink } from "./richText.ts";

export type TextMessage = { text: string; facets?: any[]; embed?: any };

function withFacets(rawText: string, embed?: any): TextMessage {
  const { text, facets: labeledFacets } = extractLabeledLinks(rawText); // "[label](url)" → linked label
  const facets = [...labeledFacets, ...buildLinkFacets(text)];
  return { text, ...(facets.length > 0 ? { facets } : {}), ...(embed ? { embed } : {}) };
}

export async function buildTextMessage(
  text: string,
  session: any,
  resolvePostLinks?: PostLinkResolver, // tests inject a fake; default resolves through the session
): Promise<TextMessage> {
  const firstPostLink = findPostLinks(text)[0];
  if (!firstPostLink) return withFacets(text);
  try {
    const resolver = resolvePostLinks ?? createBlueskyPostResolver(session);
    const resolvedPost = (await resolver([firstPostLink])).get(firstPostLink);
    if (!resolvedPost) return withFacets(text);
    const embed = { $type: "app.bsky.embed.record", record: { uri: resolvedPost.uri, cid: resolvedPost.cid } };
    return withFacets(removeLink(text, firstPostLink), embed);
  } catch {
    return withFacets(text); // a failed lookup must not lose the message: send it with a clickable link
  }
}
