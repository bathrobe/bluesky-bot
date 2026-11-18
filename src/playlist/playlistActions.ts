// Runs the playlist side of a plan. Wraps the Sender's sendAction:
//   - `playlist_add` writes the song to state.json and sends nothing to Bluesky;
//   - a text or caption with {playlist} gets the token swapped for a labeled link to the current
//     playlist (current = after any playlist_add earlier in the same plan), then goes to the Sender.
import type { HomerState } from "../state.ts";
import { fetchLinkPreview } from "../tools/linkPreview.ts";
import type { PostAction } from "../tools/post.ts";
import { PLAYLIST_NAME, PLAYLIST_TOKEN, playlistLink, videoIdInMessage } from "./playlist.ts";

export type ChatAction = Exclude<PostAction, { type: "playlist_add" }>;
type SendResult = { sent: true; messageId: string } | { sent: false; reason: string };

export type PlaylistActionWorld = {
  messages: any[];
  readState: () => Promise<HomerState>;
  updateState: (changeState: (state: HomerState) => void) => Promise<unknown>;
  sendChatAction: (action: ChatAction) => Promise<SendResult>;
  fetchTitle?: (url: string) => Promise<string>; // tests inject a fake; default asks youtube's oembed
};

const titleFromYoutube = async (url: string) => (await fetchLinkPreview(url)).title;

export function createPlaylistAwareSender(world: PlaylistActionWorld) {
  const withLink = async (words: string) => {
    if (!words.includes(PLAYLIST_TOKEN)) return words;
    const link = playlistLink((await world.readState()).playlist);
    return words.replaceAll(PLAYLIST_TOKEN, `[${PLAYLIST_NAME}](${link})`);
  };
  return async function sendAction(action: PostAction): Promise<SendResult> {
    if (action.type === "text") return world.sendChatAction({ ...action, text: await withLink(action.text) });
    if (action.type === "meme") return world.sendChatAction(action.caption ? { ...action, caption: await withLink(action.caption) } : action);
    if (action.type !== "playlist_add") return world.sendChatAction(action);
    const videoId = videoIdInMessage(world.messages.find((message) => message.id === action.messageId));
    if (!videoId) throw new Error(`no youtube video in message ${action.messageId}`);
    const title = await (world.fetchTitle ?? titleFromYoutube)(`https://www.youtube.com/watch?v=${videoId}`).catch(() => "");
    await world.updateState((state) => {
      if (!state.playlist.some((song) => song.videoId === videoId)) state.playlist.push({ videoId, title, addedAt: new Date().toISOString() });
    });
    return { sent: true, messageId: action.messageId };
  };
}
