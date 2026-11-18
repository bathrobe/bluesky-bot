// Small pieces of a transcript line. buildTranscript in transcript.ts puts them together.

export const DELETED_MESSAGE_TYPE = "chat.bsky.convo.defs#deletedMessageView";

export function isDeleted(message: any): boolean {
  return message?.$type === DELETED_MESSAGE_TYPE;
}

export function formatAge(sentAtMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - sentAtMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.round(delta / minute)}m ago`;
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  return `${Math.round(delta / day)}d ago`;
}

export function formatNow(nowMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })
    .format(new Date(nowMs))
    .toLowerCase();
}

// Newlines would break "one line per message"; fold them to " / ".
export function flattenText(text: string | undefined): string {
  return (text ?? "").trim().replace(/\s*\n+\s*/g, " / ");
}

export function snippet(text: string | undefined, maxLength = 40): string {
  const flat = flattenText(text);
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

// A shared Bluesky post (memes are these). Shows who posted it, its text, and image alt text.
export function describeEmbed(embed: any): string {
  if (!embed) return "";
  const record = embed.record;
  if (record?.$type !== "app.bsky.embed.record#viewRecord") return "(shared post, unavailable)";
  const parts = [`shared post by ${record.author?.handle ?? "unknown"}`];
  const postText = flattenText(record.value?.text);
  if (postText) parts.push(`"${postText}"`);
  const altTexts = (record.embeds ?? [])
    .flatMap((attached: any) => attached.images ?? [])
    .map((image: any) => flattenText(image.alt))
    .filter(Boolean);
  if (altTexts.length > 0) parts.push(`image: ${altTexts.map((alt: string) => `"${alt}"`).join(", ")}`);
  else if ((record.embeds ?? []).length > 0) parts.push("image");
  return `(${parts.join(", ")})`;
}

// Reactions folded onto their message, oldest first: "[👍 homer · 😂 joe]".
export function describeReactions(reactions: any[] | undefined, nameForDid: (did: string) => string): string {
  if (!reactions || reactions.length === 0) return "";
  const ordered = [...reactions].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return `[${ordered.map((reaction) => `${reaction.value} ${nameForDid(reaction.sender?.did)}`).join(" · ")}]`;
}
