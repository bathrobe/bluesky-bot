import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog } from "./catalog.ts";
import { checkCatalog } from "./checkCatalog.ts";
import { bothPostsResolve, createFakeResolver, FIXTURE_CATALOG_PATH, HORSE_LINK, SOUP_LINK } from "./memesTestHelpers.ts";

async function makeMemeFolder(fileNames: string[]) {
  const folder = await mkdtemp(join(tmpdir(), "homer-memes-"));
  for (const fileName of fileNames) await writeFile(join(folder, fileName), "");
  return folder;
}

const allFixtureFiles = ["soup-cat.jpeg", "horse-stare.png", "unposted-wave.mp4"];

describe("checkCatalog", () => {
  it("--posted-only: every posted entry ok when files exist and posts resolve", async () => {
    const result = await checkCatalog({
      entries: await loadCatalog(FIXTURE_CATALOG_PATH),
      memeFolder: await makeMemeFolder(allFixtureFiles),
      resolvePostLinks: createFakeResolver(bothPostsResolve).resolvePostLinks,
      postedOnly: true,
    });
    expect(result.ok).toBe(true);
    expect(result.entryChecks.map((entryCheck) => entryCheck.file)).toEqual(["soup-cat.jpeg", "horse-stare.png"]);
  });

  it("without the flag, names the entry with no post", async () => {
    const result = await checkCatalog({
      entries: await loadCatalog(FIXTURE_CATALOG_PATH),
      memeFolder: await makeMemeFolder(allFixtureFiles),
      resolvePostLinks: createFakeResolver(bothPostsResolve).resolvePostLinks,
    });
    expect(result.ok).toBe(false);
    expect(result.problemEntryCount).toBe(1);
    expect(result.entryChecks[2]).toEqual({ file: "unposted-wave.mp4", problems: ["no post link"] });
  });

  it("names a missing file, a post that does not resolve, and a bad link", async () => {
    const entries = [
      ...(await loadCatalog(FIXTURE_CATALOG_PATH)),
      { file: "made-up.gif", description: "x", goodFor: "y", post: "https://example.com/not-bluesky" },
    ];
    const memeFolder = await makeMemeFolder(["soup-cat.jpeg", "unposted-wave.mp4"]);
    const result = await checkCatalog({
      entries,
      memeFolder,
      resolvePostLinks: createFakeResolver({ [SOUP_LINK]: bothPostsResolve[SOUP_LINK] }).resolvePostLinks,
      postedOnly: true,
    });
    expect(result.problemEntryCount).toBe(2);
    expect(result.entryChecks[1].problems).toEqual([`no file in ${memeFolder}`, `post does not resolve: ${HORSE_LINK}`]);
    expect(result.entryChecks[2].file).toBe("made-up.gif");
    expect(result.entryChecks[2].problems).toContain("not a bsky.app post link: https://example.com/not-bluesky");
  });
});
