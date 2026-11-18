// Builds the chat message(s) for a `meme` action. The meme's public post is the message's embed, and a
// chat message holds one embed. So when the caption cites a bsky.app post, that post gets a message of
// its own (the card, no text), sent first; the meme follows with the rest of the caption.
// Any other URL in the caption gets a link facet, so it is clickable.
import type { PostLinkResolver } from "../memes/resolvePosts.ts";
import { buildTextMessage, type TextMessage } from "./textMessage.ts";

export type MemeMessages = { citedPostMessage?: TextMessage; memeMessage: TextMessage };

export async function buildMemeMessages(
  caption: string,
  memePost: { uri: string; cid: string },
  session: any,
  resolvePostLinks?: PostLinkResolver,
): Promise<MemeMessages> {
  const memeEmbed = { $type: "app.bsky.embed.record", record: { uri: memePost.uri, cid: memePost.cid } };
  const captionMessage = await buildTextMessage(caption, session, resolvePostLinks); // its embed, if any, is the cited post
  const { embed: citedPostEmbed, ...captionWithoutEmbed } = captionMessage;
  const memeMessage = { ...captionWithoutEmbed, embed: memeEmbed };
  return citedPostEmbed ? { citedPostMessage: { text: "", embed: citedPostEmbed }, memeMessage } : { memeMessage };
}
