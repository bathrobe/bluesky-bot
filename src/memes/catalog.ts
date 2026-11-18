// The meme catalog: load memes/catalog.yaml, resolve post links once, render it for the prompt.
// Only entries with a `post` that resolved to URI + CID can be sent or shown to the model.
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { config } from "../config.ts";
import type { PostLinkResolver } from "./resolvePosts.ts";

const memeEntrySchema = z.object({
  file: z.string().min(1),
  description: z.string().min(1),
  goodFor: z.string().min(1),
  post: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export type MemeEntry = z.infer<typeof memeEntrySchema>;
export type SendableMeme = MemeEntry & { post: string; uri: string; cid: string };
export type MemeTag = "fresh" | "spent";
export type IsMemeSpent = (file: string) => boolean;

export function parseCatalogText(yamlText: string): MemeEntry[] {
  const entries = z.array(memeEntrySchema).parse(parseYaml(yamlText) ?? []);
  const seenFiles = new Set<string>();
  for (const entry of entries) {
    if (seenFiles.has(entry.file)) throw new Error(`catalog lists "${entry.file}" twice`);
    seenFiles.add(entry.file);
  }
  return entries;
}

export async function loadCatalog(catalogPath: string = config.memeCatalogPath): Promise<MemeEntry[]> {
  return parseCatalogText(await readFile(catalogPath, "utf8"));
}

// Startup: resolve every post link once (in memory). Entries with no post, or whose post
// did not resolve, are dropped here, so they never reach the prompt or the Sender.
export async function loadSendableCatalog(
  resolvePostLinks: PostLinkResolver,
  catalogPath: string = config.memeCatalogPath,
): Promise<{ sendableMemes: SendableMeme[]; unsendableFiles: string[] }> {
  const entries = await loadCatalog(catalogPath);
  const postedEntries = entries.filter((entry) => entry.post);
  const resolvedPosts = await resolvePostLinks(postedEntries.map((entry) => entry.post!));
  const sendableMemes: SendableMeme[] = [];
  const unsendableFiles: string[] = [];
  for (const entry of entries) {
    const resolvedPost = entry.post ? resolvedPosts.get(entry.post) : undefined;
    if (resolvedPost) sendableMemes.push({ ...entry, post: entry.post!, ...resolvedPost });
    else unsendableFiles.push(entry.file);
  }
  return { sendableMemes, unsendableFiles };
}

export function findSendableMeme(sendableMemes: SendableMeme[], file: string): SendableMeme | undefined {
  return sendableMemes.find((meme) => meme.file === file);
}

const neverSpent: IsMemeSpent = () => false;

// One line per entry with a post: "file [fresh] for: <goodFor> | shows: <description>".
// The spent/fresh decision comes from memes/usage.ts (item 15); default is all fresh.
export function renderCatalogForPrompt(entries: MemeEntry[], isMemeSpent: IsMemeSpent = neverSpent): string {
  return entries
    .filter((entry) => entry.post)
    .map((entry) => {
      const tag: MemeTag = isMemeSpent(entry.file) ? "spent" : "fresh";
      return `${entry.file} [${tag}] for: ${oneLine(entry.goodFor)} | shows: ${oneLine(entry.description)}`;
    })
    .join("\n");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
