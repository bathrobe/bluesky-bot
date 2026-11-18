// Outbound-text hygiene: nothing the model writes reaches chat until it passes through here.
// See spec.md > Plan check > Text hygiene.

// Model control / delimiter tokens that must never reach a live message. When a decode goes
// wrong the model can spill raw chat-template markup into a send (seen in Signal Homer:
// "…</｜DDSML｜parameter></think>…"). We cut at the earliest marker and keep the clean prefix.
// Ported from stripControlTokens in Signal Homer's safety/proxy.ts.
const controlTokenNeedles = [
  "</think>",
  "<think>",
  "｜DDSML｜",
  "｜DSML｜",
  "</｜", // closing chat-template tag with fullwidth pipe (U+FF5C)
  "<｜", // fullwidth-pipe chat-template delimiter
  "<|", // ascii pipe variant
  "｜", // lone fullwidth pipe: never in normal chat; backstop for DSML markers
  "<invoke",
  "</invoke>",
  "<parameter",
  "</parameter>",
  "<function",
  "</function",
];

export function stripControlTokens(text: string): { clean: string; found: boolean } {
  let earliestIndex = -1;
  for (const needle of controlTokenNeedles) {
    const index = text.indexOf(needle);
    if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) earliestIndex = index;
  }
  if (earliestIndex === -1) return { clean: text, found: false };
  return { clean: text.slice(0, earliestIndex).trimEnd(), found: true };
}

// Models sometimes write the two characters `\n` (or the mangled `/n`) instead of a line break.
// Turn them into real newlines. Links are left alone ("example.com/news"), and `/n` followed by
// more letters survives ("w/new"). Ported from Signal Homer's lib/normalize-text.ts.
function normalizeWord(word: string): string {
  if (word.includes("://") || word.toLowerCase().startsWith("www.")) return word;
  return word.replace(/\\n/g, "\n").replace(/\/n(?![a-z0-9])/gi, "\n");
}

export function normalizeEscapedNewlines(text: string): string {
  // Split on whitespace but keep the separators, so real spacing passes through untouched.
  return text
    .split(/(\s+)/)
    .map((part, index) => (index % 2 === 0 ? normalizeWord(part) : part))
    .join("");
}

// The one entry point for outbound text. `text` may be "" — the plan check rejects that.
export function cleanText(rawText: string): { text: string; foundControlTokens: boolean } {
  const { clean, found } = stripControlTokens(rawText);
  return { text: normalizeEscapedNewlines(clean).trim(), foundControlTokens: found };
}
