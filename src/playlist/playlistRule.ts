// Plan check for the playlist. `playlist_add` names a transcript message; that message must hold a
// youtube video that is not on the playlist yet. The {playlist} token needs a playlist to point at.
import type { PostPlan } from "../tools/post.ts";
import type { PlanCheckContext } from "../plan/planRules.ts";
import { MAX_PLAYLIST_SONGS, PLAYLIST_TOKEN, videoIdInMessage } from "./playlist.ts";

export function checkPlaylist(plan: PostPlan, context: PlanCheckContext): string[] {
  const onPlaylist = new Set(context.playlistVideoIds ?? []);
  const errors: string[] = [];
  plan.actions.forEach((action, index) => {
    if (action.type !== "playlist_add") return;
    const label = `action ${index + 1} (playlist_add)`;
    if (context.runKind === "gm" || context.runKind === "welcome") return errors.push(`${label}: the ${context.runKind} run does not touch the playlist. drop it.`);
    const message = context.messages.find((candidate) => candidate.id === action.messageId);
    const videoId = message ? videoIdInMessage(message) : null;
    if (!videoId) return errors.push(`${label}: message {${action.messageId}} is not a transcript message with a youtube video link. only youtube videos can go on the playlist.`);
    if (onPlaylist.has(videoId)) return errors.push(`${label}: the video in {${action.messageId}} is already on the playlist. drop it.`);
    if (onPlaylist.size >= MAX_PLAYLIST_SONGS) return errors.push(`${label}: the playlist is full (${MAX_PLAYLIST_SONGS} songs). drop it.`);
    onPlaylist.add(videoId);
  });
  const usesToken = plan.actions.some((action) => (action.type === "text" && action.text.includes(PLAYLIST_TOKEN)) || (action.type === "meme" && action.caption?.includes(PLAYLIST_TOKEN)));
  if (usesToken && onPlaylist.size === 0) errors.push(`${PLAYLIST_TOKEN} was used but the playlist is empty: there is nothing to link to. remove it.`);
  return errors;
}
