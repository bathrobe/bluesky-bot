// The tengri playlist, by hand. Reads the chat (seed) and state.json; never sends anything.
//   pnpm tsx --env-file=.env scripts/playlist.ts            list the songs and print the link
//   pnpm tsx --env-file=.env scripts/playlist.ts seed       add every youtube video posted in the chat so far
//   pnpm tsx --env-file=.env scripts/playlist.ts remove ID  take one video off by its id
// Stop Homer before seed or remove (both write state.json): launchctl bootout gui/$(id -u)/com.joe.homer-bluesky
import { fetchMessagesBackTo } from "../src/bluesky/history.ts";
import { createSession } from "../src/bluesky/session.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { MAX_PLAYLIST_SONGS, playlistLink, videoIdInMessage, type PlaylistSong } from "../src/playlist/playlist.ts";
import { targetConvoId } from "../src/runs/runDependencies.ts";
import { readState, updateState } from "../src/state.ts";
import { fetchLinkPreview } from "../src/tools/linkPreview.ts";

async function videoIdsPostedInChat(): Promise<string[]> {
  await loadLaunchRecordIntoConfig();
  const { messages } = await fetchMessagesBackTo(await createSession(), targetConvoId(), 0);
  return [...new Set(messages.map(videoIdInMessage).filter((videoId): videoId is string => Boolean(videoId)))];
}

async function seed() {
  const alreadyOn = new Set((await readState()).playlist.map((song) => song.videoId));
  const newVideoIds = (await videoIdsPostedInChat()).filter((videoId) => !alreadyOn.has(videoId)).slice(0, MAX_PLAYLIST_SONGS - alreadyOn.size);
  const newSongs: PlaylistSong[] = [];
  for (const videoId of newVideoIds) {
    const title = await fetchLinkPreview(`https://www.youtube.com/watch?v=${videoId}`).then((preview) => preview.title, () => "");
    newSongs.push({ videoId, title, addedAt: new Date().toISOString() });
  }
  await updateState((state) => { state.playlist.push(...newSongs); });
  console.log(`added ${newSongs.length} song(s)`);
}

async function main() {
  const [command, videoId] = process.argv.slice(2);
  if (command === "seed") await seed();
  if (command === "remove") await updateState((state) => { state.playlist = state.playlist.filter((song) => song.videoId !== videoId); });
  const { playlist } = await readState();
  playlist.forEach((song, index) => console.log(`${index + 1}. ${song.videoId}  ${song.title || "(no title)"}`));
  console.log(playlist.length > 0 ? playlistLink(playlist) : "the playlist is empty");
}

main().catch((error) => {
  console.error("playlist failed:", error?.message ?? error);
  process.exit(1);
});
