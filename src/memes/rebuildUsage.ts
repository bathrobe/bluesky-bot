// Rebuild one conversation's memeLastUsed from the chat itself: Homer's own messages that embed
// a catalog meme's post. Pure: messages in, file -> ISO time out. See spec.md > Data and state.
// Embed shape as read back: spike-notes.md > Item 4 findings (`embed.record.uri`).
import type { SendableMeme } from "./catalog.ts";

export function fileByUriOf(sendableMemes: SendableMeme[]): Map<string, string> {
  return new Map(sendableMemes.map((meme) => [meme.uri, meme.file]));
}

// Keeps the newest use per file. Embeds of posts not in the catalog, other people's messages
// and deleted messages (no embed) are ignored. Message order does not matter.
export function rebuildMemeLastUsed(messages: any[], homerDid: string, fileByUri: Map<string, string>): Record<string, string> {
  const lastUsedByFile: Record<string, string> = {};
  for (const message of messages) {
    if (message.sender?.did !== homerDid) continue;
    const file = fileByUri.get(message.embed?.record?.uri);
    if (!file || !message.sentAt) continue;
    const previous = lastUsedByFile[file];
    if (!previous || Date.parse(message.sentAt) > Date.parse(previous)) lastUsedByFile[file] = message.sentAt;
  }
  return lastUsedByFile;
}

// Page back through a conversation, newest first, until a page comes back empty or there is no cursor.
export async function collectAllMessages(
  fetchPage: (cursor?: string) => Promise<{ messages: any[]; nextCursor?: string }>,
  maxPages = 1000,
): Promise<any[]> {
  const allMessages: any[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await fetchPage(cursor);
    if (page.messages.length === 0) break;
    allMessages.push(...page.messages);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return allMessages;
}
