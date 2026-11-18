// The tengri playlist: a list of youtube videos kept in state.json (`playlist`), nothing on any account.
// The link is youtube's no-account form: watch_videos?video_ids=a,b,c opens those videos as a temporary
// playlist. It holds 50 videos at most and is a new link every time the list changes.
import { linksInMessage } from "../tools/readLink.ts";

export type PlaylistSong = { videoId: string; title: string; addedAt: string };

export const PLAYLIST_NAME = "tengri playlist";
export const PLAYLIST_TOKEN = "{playlist}"; // in a text or caption: becomes the words "tengri playlist", linked
export const MAX_PLAYLIST_SONGS = 50;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

// The video id of a youtube link, or null for any other link (channels, playlists, other sites).
export function youtubeVideoIdOf(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  if (host === "youtu.be") videoId = pathParts[0] ?? null;
  else if (host === "youtube.com" && pathParts[0] === "watch") videoId = parsed.searchParams.get("v");
  else if (host === "youtube.com" && ["shorts", "live", "embed"].includes(pathParts[0])) videoId = pathParts[1] ?? null;
  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function videoIdInMessage(message: any): string | null {
  for (const link of linksInMessage(message)) {
    const videoId = youtubeVideoIdOf(link);
    if (videoId) return videoId;
  }
  return null;
}

export function playlistLink(songs: PlaylistSong[]): string {
  return `https://www.youtube.com/watch_videos?video_ids=${songs.map((song) => song.videoId).join(",")}`;
}

// The run-note line: how big the playlist is, what went on last, and which transcript messages
// hold a youtube link that is not on it. Facts for his discretion; nothing is added without a playlist_add.
export function playlistNoteLine(songs: PlaylistSong[], messages: any[]): string {
  const onPlaylist = new Set(songs.map((song) => song.videoId));
  const newestTitles = songs.slice(-3).reverse().map((song) => `"${song.title || song.videoId}"`);
  const notOnIt = messages.filter((message) => { const videoId = videoIdInMessage(message); return videoId && !onPlaylist.has(videoId); });
  const size = songs.length === 0 ? "empty" : `${songs.length} songs. newest: ${newestTitles.join(", ")}`;
  const candidates = notOnIt.length > 0 ? ` youtube links in the transcript that are not on it: ${notOnIt.slice(-6).map((message) => `{${message.id}}`).join(", ")}.` : "";
  return `- ${PLAYLIST_NAME}: ${size}.${candidates}`;
}
