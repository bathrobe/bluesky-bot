// Run-note lines about Homer's own recent habits: facts counted from the transcript, not rules.
//   - pace: how many messages from other people since he last spoke
//   - mix: what his last few messages were (memes, bluesky posts, plain text)
//   - words: the words he has used in several of his last few messages
import { config } from "../config.ts";
import { otherMessagesSinceHomerSpoke } from "../plan/heartbeatPaceRules.ts";

const RECENT_OWN_MESSAGES = 8;
const REPEATED_IN_AT_LEAST = 3;
const COMMON_WORDS = new Set(
  "that this with have from your they them just what when then than here there about into over like been were will would could should their it's i'm don't can't still only every some more most much very really where which while because".split(" "),
);

type MessageKind = "meme" | "bluesky post" | "plain text";

function kindOf(message: any, homerDid: string): MessageKind {
  const sharedPostUri: string | undefined = message.embed?.record?.uri;
  if (!sharedPostUri) return "plain text";
  return sharedPostUri.includes(homerDid) ? "meme" : "bluesky post"; // memes are posts on Homer's own profile
}

// "horses" and "horse" count as one word; short and common words are left out.
function distinctWordsOf(text: string): Set<string> {
  const words = (text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((word) => !COMMON_WORDS.has(word));
  return new Set(words.map((word) => (word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word)));
}

export function repeatedWords(ownMessages: any[]): string[] {
  const messageCountByWord = new Map<string, number>();
  for (const message of ownMessages) {
    for (const word of distinctWordsOf(message.text ?? "")) messageCountByWord.set(word, (messageCountByWord.get(word) ?? 0) + 1);
  }
  return [...messageCountByWord.entries()]
    .filter(([, count]) => count >= REPEATED_IN_AT_LEAST)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 6)
    .map(([word, count]) => `${word} (${count})`);
}

export function buildHabitNoteLines(visibleMessages: any[], homerDid: string): string[] {
  const ownMessages = visibleMessages.filter((message) => message.sender?.did === homerDid).slice(-RECENT_OWN_MESSAGES);
  if (ownMessages.length === 0) return [];
  const lines: string[] = [];
  const newFromOthers = otherMessagesSinceHomerSpoke(visibleMessages, homerDid).length;
  const minimum = config.caps.heartbeatMinOtherMessages;
  const paceVerdict = newFromOthers < minimum ? ` under ${minimum}, so this tick is reactions only (a reply to someone who said your name is still fine).` : "";
  lines.push(`- ${newFromOthers} messages from other people since your last message.${paceVerdict}`);

  const kinds: MessageKind[] = ["meme", "bluesky post", "plain text"];
  const mix = kinds.map((kind) => `${ownMessages.filter((message) => kindOf(message, homerDid) === kind).length} ${kind}`).join(", ");
  lines.push(`- your last ${ownMessages.length} messages: ${mix}.`);

  const words = repeatedWords(ownMessages);
  if (words.length > 0) lines.push(`- words in several of those messages: ${words.join(", ")}. the room has heard them from you.`);
  return lines;
}
