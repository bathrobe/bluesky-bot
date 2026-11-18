// Fetches what a link is: site, title, description. Read-only GETs, nothing from the chat is sent
// except the URL itself. YouTube and Spotify answer through their oEmbed endpoints (their pages
// need scripts); every other site is read from its <title> and og: meta tags.
const TIMEOUT_MS = 8000;
const MAX_PAGE_CHARACTERS = 300_000;
const MAX_FIELD_CHARACTERS = 300;
const OEMBED_ENDPOINT_BY_HOST: Record<string, string> = {
  "youtube.com": "https://www.youtube.com/oembed?format=json&url=",
  "youtu.be": "https://www.youtube.com/oembed?format=json&url=",
  "open.spotify.com": "https://open.spotify.com/oembed?url=",
};

export type LinkPreview = { site: string; title: string; description: string };
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^(www|m|music)\./, "");

// Only public web addresses: no localhost, no bare IPs, no names that stay inside a home or office network.
export function isPublicWebUrl(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (host === "localhost" || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return false;
  return !/\.(local|internal|lan|home|localhost)$/.test(host);
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_CHARACTERS);

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole);
}

function metaContent(html: string, key: string): string {
  const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*>`, "i"))?.[0] ?? "";
  return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

export function previewFromHtml(html: string, url: string): LinkPreview {
  const titleTag = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  return {
    site: clean(metaContent(html, "og:site_name") || hostOf(url)),
    title: clean(metaContent(html, "og:title") || titleTag),
    description: clean(metaContent(html, "og:description") || metaContent(html, "description")),
  };
}

export async function fetchLinkPreview(url: string, fetchPage: FetchLike = fetch as any): Promise<LinkPreview> {
  if (!isPublicWebUrl(url)) throw new Error("that link is not a public web address");
  const oembedEndpoint = OEMBED_ENDPOINT_BY_HOST[hostOf(url)];
  const target = oembedEndpoint ? oembedEndpoint + encodeURIComponent(url) : url;
  const response = await fetchPage(target, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0 (compatible; link-preview)", accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`the site answered ${response.status}`);
  const body = (await response.text()).slice(0, MAX_PAGE_CHARACTERS);
  if (!oembedEndpoint) return previewFromHtml(body, url);
  const oembed = JSON.parse(body);
  return { site: clean(oembed.provider_name || hostOf(url)), title: clean(oembed.title), description: clean(oembed.author_name ? `by ${oembed.author_name}` : "") };
}
