// Pure text helpers for outgoing chat messages: find links, build link facets, spot bsky.app post links.
// A facet marks a byte range of the text as a link; without one the app shows a URL as dead text.
// Mention facets are deliberately never built here: Homer does not @ people.

export type FoundLink = { url: string; startIndex: number; endIndex: number }; // string indexes, not bytes

const URL_PATTERN = /https?:\/\/[^\s<>"'\])]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const POST_LINK_PATTERN = /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/?#]+\/?$/;

export function findLinks(text: string): FoundLink[] {
  const foundLinks: FoundLink[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    const startIndex = match.index ?? 0;
    foundLinks.push({ url, startIndex, endIndex: startIndex + url.length });
  }
  return foundLinks;
}

export function isPostLink(url: string): boolean {
  return POST_LINK_PATTERN.test(url);
}

export function findPostLinks(text: string): string[] {
  return findLinks(text).map((link) => link.url).filter(isPostLink);
}

const byteLengthOf = (text: string) => Buffer.byteLength(text, "utf8");

// One link facet per URL. Offsets are UTF-8 bytes, as the lexicon requires (emoji before a link shift them).
export function buildLinkFacets(text: string): any[] {
  return findLinks(text).map((link) => ({
    $type: "app.bsky.richtext.facet",
    index: {
      byteStart: byteLengthOf(text.slice(0, link.startIndex)),
      byteEnd: byteLengthOf(text.slice(0, link.endIndex)),
    },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: link.url }],
  }));
}

// Takes the first occurrence of a URL out of the text and tidies the gap it leaves.
export function removeLink(text: string, url: string): string {
  const startIndex = text.indexOf(url);
  if (startIndex === -1) return text;
  const withoutLink = text.slice(0, startIndex) + text.slice(startIndex + url.length);
  return withoutLink
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// "[label](https://…)" → the label alone in the text, plus a link facet over it. Used for long links
// that should not be shown raw (the playlist link). Offsets are UTF-8 bytes of the returned text.
export function extractLabeledLinks(text: string): { text: string; facets: any[] } {
  const facets: any[] = [];
  let plainText = "";
  let readFrom = 0;
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    plainText += text.slice(readFrom, match.index);
    const byteStart = byteLengthOf(plainText);
    plainText += match[1];
    facets.push({ $type: "app.bsky.richtext.facet", index: { byteStart, byteEnd: byteLengthOf(plainText) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: match[2] }] });
    readFrom = (match.index ?? 0) + match[0].length;
  }
  return { text: plainText + text.slice(readFrom), facets };
}
