import { describe, expect, it } from "vitest";
import {
  findSendableMeme,
  loadCatalog,
  loadSendableCatalog,
  parseCatalogText,
  renderCatalogForPrompt,
} from "./catalog.ts";
import { parsePostLink } from "./resolvePosts.ts";
import { bothPostsResolve, createFakeResolver, FIXTURE_CATALOG_PATH, SOUP_LINK } from "./memesTestHelpers.ts";

describe("loadCatalog", () => {
  it("loads every entry, with or without a post", async () => {
    const entries = await loadCatalog(FIXTURE_CATALOG_PATH);
    expect(entries.map((entry) => entry.file)).toEqual(["soup-cat.jpeg", "horse-stare.png", "unposted-wave.mp4"]);
    expect(entries[1].notes).toBe("kept for the horse bit");
    expect(entries[2].post).toBeUndefined();
  });

  it("rejects an entry missing goodFor, and a file listed twice", () => {
    expect(() => parseCatalogText("- file: a.jpg\n  description: x\n")).toThrow();
    const twice = "- {file: a.jpg, description: x, goodFor: y}\n- {file: a.jpg, description: x, goodFor: y}\n";
    expect(() => parseCatalogText(twice)).toThrow('catalog lists "a.jpg" twice');
  });
});

describe("loadSendableCatalog", () => {
  it("resolves posts once and keeps only entries whose post resolved", async () => {
    const fakeResolver = createFakeResolver({ [SOUP_LINK]: bothPostsResolve[SOUP_LINK] });
    const { sendableMemes, unsendableFiles } = await loadSendableCatalog(
      fakeResolver.resolvePostLinks,
      FIXTURE_CATALOG_PATH,
    );
    expect(fakeResolver.calls).toHaveLength(1);
    expect(sendableMemes.map((meme) => meme.file)).toEqual(["soup-cat.jpeg"]);
    expect(findSendableMeme(sendableMemes, "soup-cat.jpeg")).toMatchObject({ cid: "bafysoup" });
    expect(unsendableFiles).toEqual(["horse-stare.png", "unposted-wave.mp4"]);
    expect(findSendableMeme(sendableMemes, "unposted-wave.mp4")).toBeUndefined();
  });
});

describe("renderCatalogForPrompt", () => {
  it("leaves out entries with no post, tags all fresh by default, one line each", async () => {
    const rendered = renderCatalogForPrompt(await loadCatalog(FIXTURE_CATALOG_PATH));
    expect(rendered).toBe(
      "soup-cat.jpeg [fresh] for: someone asks who wants soup | shows: A cat in a soup bowl\n" +
        "horse-stare.png [fresh] for: the horse thing comes up again | shows: A horse staring at the camera",
    );
    expect(rendered).not.toContain("unposted-wave.mp4");
  });

  it("tags spent memes from the given decision", async () => {
    const rendered = renderCatalogForPrompt(await loadCatalog(FIXTURE_CATALOG_PATH), (file) => file === "horse-stare.png");
    expect(rendered).toContain("soup-cat.jpeg [fresh]");
    expect(rendered).toContain("horse-stare.png [spent]");
  });
});

describe("parsePostLink", () => {
  it("reads handle and record key, and refuses other links", () => {
    expect(parsePostLink(SOUP_LINK)).toEqual({ handleOrDid: "homer.example", recordKey: "3fixture0001" });
    expect(parsePostLink("https://example.com/post/1")).toBeNull();
  });
});
