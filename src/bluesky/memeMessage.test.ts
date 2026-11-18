// A meme caption that cites a bluesky post: the post goes out first as its own card, then the meme. No network.
import { describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { buildMemeMessages } from "./memeMessage.ts";
import { makeFakeSendContext } from "./send.ts.fakes.ts";
import { sendMemeEmbed } from "./send.ts";

const postLink = "https://bsky.app/profile/someone.bsky.social/post/3fakepost0001";
const citedPost = { uri: "at://did:plc:someone/app.bsky.feed.post/3fakepost0001", cid: "bafycited" };
const memePost = { uri: "at://did:plc:homer/app.bsky.feed.post/3meme", cid: "bafymeme" };
const embedOf = (record: any) => ({ $type: "app.bsky.embed.record", record });
const resolveAll = async (links: string[]) => new Map(links.map((link) => [link, citedPost]));
const resolveNone = async () => new Map();

describe("buildMemeMessages", () => {
  it("no caption, or a plain caption, is one message with the meme embedded", async () => {
    expect(await buildMemeMessages("", memePost, null)).toEqual({ memeMessage: { text: "", embed: embedOf(memePost) } });
    expect(await buildMemeMessages("soup", memePost, null)).toEqual({ memeMessage: { text: "soup", embed: embedOf(memePost) } });
  });

  it("a cited post leaves the caption and becomes its own card message", async () => {
    expect(await buildMemeMessages(`went with this one\n${postLink}`, memePost, null, resolveAll)).toEqual({
      citedPostMessage: { text: "", embed: embedOf(citedPost) },
      memeMessage: { text: "went with this one", embed: embedOf(memePost) },
    });
  });

  it("an ordinary link, or a post that does not resolve, stays in the caption as a clickable link", async () => {
    const withLink = await buildMemeMessages("read https://example.com/x", memePost, null);
    expect(withLink.citedPostMessage).toBeUndefined();
    expect(withLink.memeMessage.facets?.[0].features[0].uri).toBe("https://example.com/x");
    const unresolved = await buildMemeMessages(`see ${postLink}`, memePost, null, resolveNone);
    expect(unresolved.citedPostMessage).toBeUndefined();
    expect(unresolved.memeMessage.facets?.[0].features[0].uri).toBe(postLink);
  });
});

describe("sendMemeEmbed with a cited post", () => {
  it("sends the card first with the reply target, then the meme with the rest of the caption", async () => {
    const fake = makeFakeSendContext();
    await sendMemeEmbed({ ...fake.context, resolvePostLinks: resolveAll }, TEST_DM_CONVO_ID, memePost, `the pick ${postLink}`, "target1");
    expect(fake.sentMessages().map((sent: any) => sent.message)).toEqual([
      { text: "", embed: embedOf(citedPost), replyTo: { messageId: "target1" } },
      { text: "the pick", embed: embedOf(memePost) },
    ]);
  });

  it("resolves nothing and sends nothing while paused", async () => {
    const fake = makeFakeSendContext(true);
    const resolver = vi.fn(resolveAll);
    await sendMemeEmbed({ ...fake.context, resolvePostLinks: resolver }, TEST_DM_CONVO_ID, memePost, postLink);
    expect(resolver).not.toHaveBeenCalled();
    fake.expectNothingSent();
  });
});
