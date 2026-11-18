// Check every catalog entry: its file is in the meme folder, it has a post, and the post resolves.
// Used by scripts/checkCatalog.ts and (item 27) scripts/acceptGroup.ts.
import { readdir } from "node:fs/promises";
import type { MemeEntry } from "./catalog.ts";
import { parsePostLink, type PostLinkResolver } from "./resolvePosts.ts";

export type CatalogEntryCheck = { file: string; problems: string[] };
export type CatalogCheckResult = { entryChecks: CatalogEntryCheck[]; problemEntryCount: number; ok: boolean };

export async function checkCatalog(options: {
  entries: MemeEntry[];
  memeFolder: string;
  resolvePostLinks: PostLinkResolver;
  postedOnly?: boolean;
}): Promise<CatalogCheckResult> {
  const entriesToCheck = options.postedOnly ? options.entries.filter((entry) => entry.post) : options.entries;
  const filesInFolder = await listFolderFiles(options.memeFolder);
  const postLinks = entriesToCheck.flatMap((entry) => (entry.post ? [entry.post] : []));
  const resolvedPosts = await options.resolvePostLinks(postLinks);

  const entryChecks = entriesToCheck.map((entry) => {
    const problems: string[] = [];
    if (!filesInFolder.has(entry.file)) problems.push(`no file in ${options.memeFolder}`);
    if (!entry.post) problems.push("no post link");
    else if (!parsePostLink(entry.post)) problems.push(`not a bsky.app post link: ${entry.post}`);
    else if (!resolvedPosts.has(entry.post)) problems.push(`post does not resolve: ${entry.post}`);
    return { file: entry.file, problems };
  });
  const problemEntryCount = entryChecks.filter((entryCheck) => entryCheck.problems.length > 0).length;
  return { entryChecks, problemEntryCount, ok: problemEntryCount === 0 };
}

async function listFolderFiles(folder: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(folder));
  } catch {
    return new Set();
  }
}
