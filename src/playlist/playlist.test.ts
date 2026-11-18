// The tengri playlist: video ids, the plan check, running a playlist_add, and the linked {playlist} token.
import { describe, expect, it, vi } from "vitest";
import { buildTextMessage } from "../bluesky/textMessage.ts";
import { validatePlan } from "../plan/validatePlan.ts";
import { makeContext, planOf, text } from "../plan/validatePlanTestHelpers.ts";
import { createDefaultState } from "../state.ts";
import { playlistLink, playlistNoteLine, youtubeVideoIdOf } from "./playlist.ts";
import { createPlaylistAwareSender } from "./playlistActions.ts";

const linkFacet = (uri: string) => ({ features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
const songMessage = { id: "s1", text: "youtube.com/watch?v=aaa...", sender: { did: "did:plc:joefixture" }, facets: [linkFacet("https://www.youtube.com/watch?v=aaaaaaaaaaa")] };
const soupMessage = { id: "s2", text: "soup", sender: { did: "did:plc:joefixture" } };
const messages = [songMessage, soupMessage];
const add = (messageId: string) => ({ type: "playlist_add", messageId });
const contextWith = (overrides = {}) => makeContext({ messages, knownMessageIds: ["s1", "s2"], ...overrides });
const song = (videoId: string, title: string) => ({ videoId, title, addedAt: "2026-11-17T00:00:00.000Z" });

describe("playlist basics", () => {
  it("finds the video id in the usual youtube link shapes, and in nothing else", () => {
    for (const url of ["https://www.youtube.com/watch?v=aaaaaaaaaaa&t=3", "https://m.youtube.com/watch?v=aaaaaaaaaaa", "https://youtu.be/aaaaaaaaaaa?si=x", "https://youtube.com/shorts/aaaaaaaaaaa"]) {
      expect(youtubeVideoIdOf(url)).toBe("aaaaaaaaaaa");
    }
    for (const url of ["https://open.spotify.com/track/abc", "https://www.youtube.com/@channel", "https://www.youtube.com/playlist?list=PL1", "nope"]) expect(youtubeVideoIdOf(url)).toBeNull();
  });

  it("builds the no-account link and the run-note line", () => {
    const songs = [song("aaaaaaaaaaa", "First"), song("bbbbbbbbbbb", "Second")];
    expect(playlistLink(songs)).toBe("https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa,bbbbbbbbbbb");
    expect(playlistNoteLine([], messages)).toBe("- tengri playlist: empty. youtube links in the transcript that are not on it: {s1}.");
    expect(playlistNoteLine(songs, messages)).toBe('- tengri playlist: 2 songs. newest: "Second", "First".');
  });
});

describe("validatePlan: playlist", () => {
  it("passes an add for a message with a youtube video, with a line that links the playlist", () => {
    expect(validatePlan(planOf(add("s1"), text("on the {playlist} now", "s1")), contextWith()).ok).toBe(true);
  });

  it("rejects a message with no video, a video already on it, an invented id, and the gm run", () => {
    const errorFor = (plan: string, overrides = {}) => { const result = validatePlan(plan, contextWith(overrides)); return result.ok ? "" : result.error; };
    expect(errorFor(planOf(add("s2")))).toContain("is not a transcript message with a youtube video link");
    expect(errorFor(planOf(add("s1")), { playlistVideoIds: ["aaaaaaaaaaa"] })).toContain("already on the playlist");
    expect(errorFor(planOf(add("s1"), add("s1")))).toContain("already on the playlist");
    expect(errorFor(planOf(add("made-up")))).toContain('messageId "made-up" is not a real message id');
    expect(errorFor(planOf(add("s1")), { runKind: "gm" })).toContain("the gm run does not touch the playlist");
  });

  it("rejects {playlist} when there is nothing on the playlist", () => {
    const result = validatePlan(planOf(text("here: {playlist}")), contextWith());
    expect(result.ok === false && result.error).toContain("the playlist is empty");
    expect(validatePlan(planOf(text("here: {playlist}")), contextWith({ playlistVideoIds: ["bbbbbbbbbbb"] })).ok).toBe(true);
  });
});

describe("running playlist actions", () => {
  function makeWorld() {
    const state = createDefaultState();
    const sendChatAction = vi.fn(async () => ({ sent: true as const, messageId: "new1" }));
    const sendAction = createPlaylistAwareSender({
      messages,
      readState: async () => state,
      updateState: async (changeState) => changeState(state),
      sendChatAction,
      fetchTitle: async () => "Riding for the Feeling",
    });
    return { state, sendChatAction, sendAction };
  }

  it("playlist_add writes the song to state and sends nothing to bluesky", async () => {
    const world = makeWorld();
    expect(await world.sendAction(add("s1") as any)).toEqual({ sent: true, messageId: "s1" });
    expect(world.state.playlist).toMatchObject([{ videoId: "aaaaaaaaaaa", title: "Riding for the Feeling" }]);
    expect(world.sendChatAction).not.toHaveBeenCalled();
  });

  it("{playlist} becomes a labeled link to the list as it stands after the add", async () => {
    const world = makeWorld();
    await world.sendAction(add("s1") as any);
    await world.sendAction({ type: "text", text: "on the {playlist} now", replyTo: "s1" });
    const sentText = (world.sendChatAction.mock.calls[0] as any)[0].text;
    expect(sentText).toBe("on the [tengri playlist](https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa) now");
    const message = await buildTextMessage(sentText, null);
    expect(message.text).toBe("on the tengri playlist now");
    expect(message.facets).toEqual([
      { $type: "app.bsky.richtext.facet", index: { byteStart: 7, byteEnd: 22 }, features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa" }] },
    ]);
  });
});
