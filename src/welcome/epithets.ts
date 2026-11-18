// Epithets: the standing Homeric epithet each newcomer gets in their welcome. Kept in state.json
// (`epithetsByDid`) so later runs call them the same thing. The welcome run's `post` carries them.
import type { HomerState } from "../state.ts";

export type Epithet = { shortName: string; epithet: string; givenAt: string };

// The run-note line for heartbeat and @-reply runs: epithets of members who are in the transcript.
export function epithetNoteLine(epithetsByDid: Record<string, Epithet>, messages: any[]): string | null {
  const didsInTranscript = new Set(messages.map((message) => message.sender?.did ?? message.data?.member?.did));
  const known = Object.entries(epithetsByDid).filter(([did]) => didsInTranscript.has(did));
  if (known.length === 0) return null;
  const list = known.map(([, given]) => `${given.shortName}: "${given.epithet}"`).join(", ");
  return `- epithets you gave at their welcome (theirs for good; use one now and then, same wording): ${list}.`;
}

// After a welcome text landed: keep the epithets from the plan, for newcomers only.
export function recordEpithets(state: HomerState, epithets: { member: string; epithet: string }[], newcomers: { did: string; shortName: string }[], givenAt: string): void {
  for (const { member, epithet } of epithets) {
    const newcomer = newcomers.find((candidate) => candidate.shortName.toLowerCase() === member.trim().replace(/^@/, "").toLowerCase());
    if (newcomer) state.epithetsByDid[newcomer.did] = { shortName: newcomer.shortName, epithet: epithet.trim(), givenAt };
  }
}
