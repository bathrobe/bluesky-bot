// Outgoing text: link facets, and a bsky.app post link turned into the message's embed. No network.
import { describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { buildLinkFacets, findPostLinks, removeLink } from "./richText.ts";
import { makeFakeSendContext } from "./send.ts.fakes.ts";
import { sendText } from "./send.ts";
import { buildTextMessage } from "./textMessage.ts";

const postLink = "https://bsky.app/profile/someone.bsky.social/post/3fakepost0001";
const resolvedPost = { uri: "at://did:plc:someone/app.bsky.feed.post/3fakepost0001", cid: "bafyfakecid" };
const resolveAll = vi.fn(async (links: string[]) => new Map(links.map((link) => [link, resolvedPost])));
const resolveNone = async () => new Map();
const sessionThatMustNotBeUsed: any = new Proxy({}, { get: () => { throw new Error("session touched"); } });

describe("richText", () => {
  it("builds a link facet with UTF-8 byte offsets and leaves trailing punctuation out", () => {
    const text = "🐎 see https://example.com/a?b=1.";
    const [facet] = buildLinkFacets(text);
    expect(facet.features).toEqual([{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com/a?b=1" }]);
    const bytes = Buffer.from(text, "utf8");
    expect(bytes.subarray(facet.index.byteStart, facet.index.byteEnd).toString("utf8")).toBe("https://example.com/a?b=1");
  });

  it("text with no link has no facets, and an @handle never becomes a mention facet", () => {
    expect(buildLinkFacets("hello @joetforhire.com")).toEqual([]);
  });

  it("finds bsky.app post links only, and removes one cleanly", () => {
    expect(findPostLinks(`a ${postLink} b https://example.com https://bsky.app/profile/someone.bsky.social`)).toEqual([postLink]);
    expect(removeLink(`horses again\n\n${postLink}`, postLink)).toBe("horses again");
    expect(removeLink(`look ${postLink} wild`, postLink)).toBe("look wild");
  });
});

describe("buildTextMessage", () => {
  it("plain text is sent as is, without touching the session", async () => {
    expect(await buildTextMessage("soup is a drink", sessionThatMustNotBeUsed)).toEqual({ text: "soup is a drink" });
  });

  it("a post link becomes the embed and leaves the text", async () => {
    const message = await buildTextMessage(`horses again\n${postLink}`, null, resolveAll);
    expect(message).toEqual({ text: "horses again", embed: { $type: "app.bsky.embed.record", record: resolvedPost } });
  });

  it("a message that is only a post link is sent as an embed with empty text", async () => {
    expect((await buildTextMessage(postLink, null, resolveAll)).text).toBe("");
  });

  it("a post that does not resolve, or a resolver that throws, keeps the link in the text as a clickable link", async () => {
    for (const resolver of [resolveNone, async () => { throw new Error("network"); }]) {
      const message = await buildTextMessage(`see ${postLink}`, null, resolver as any);
      expect(message.embed).toBeUndefined();
      expect(message.text).toBe(`see ${postLink}`);
      expect(message.facets?.[0].features[0].uri).toBe(postLink);
    }
  });

  it("a non-bluesky link stays in the text with a facet and no embed", async () => {
    const message = await buildTextMessage("read https://example.com/x", sessionThatMustNotBeUsed);
    expect(message.embed).toBeUndefined();
    expect(message.facets).toHaveLength(1);
  });
});

describe("sendText", () => {
  it("sends the embed, the trimmed text and the reply target in one message", async () => {
    const fake = makeFakeSendContext();
    await sendText({ ...fake.context, resolvePostLinks: resolveAll }, TEST_DM_CONVO_ID, `the find\n${postLink}`, "target1");
    expect(fake.sentMessages()).toEqual([
      {
        convoId: TEST_DM_CONVO_ID,
        message: { text: "the find", embed: { $type: "app.bsky.embed.record", record: resolvedPost }, replyTo: { messageId: "target1" } },
      },
    ]);
  });

  it("resolves nothing and sends nothing while paused", async () => {
    const fake = makeFakeSendContext(true);
    const resolver = vi.fn(resolveAll);
    await sendText({ ...fake.context, resolvePostLinks: resolver }, TEST_DM_CONVO_ID, postLink);
    expect(resolver).not.toHaveBeenCalled();
    fake.expectNothingSent();
  });
});
