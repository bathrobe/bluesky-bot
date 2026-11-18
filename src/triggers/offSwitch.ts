// The off switch (spec.md > Off switch): Joe sends `off` or `on` in the test DM and Homer pauses or resumes.
// Only a message in the test DM, from Joe's DID, whose whole text is `off` / `on` (any case, surrounding
// whitespace ok) counts. "off please", someone else's "off", or "off" in any other conversation do nothing.
import type { NewMessageEvent } from "../bluesky/poll.ts";
import { sendOffSwitchConfirmation, type SendContext } from "../bluesky/send.ts";
import { defaultStatePath, updateState } from "../state.ts";

export type OffSwitchCommand = "off" | "on";

export const OFF_CONFIRMATION = `ok, I'm off. I won't run or post until you send "on".`;
export const ON_CONFIRMATION = "ok, I'm back on.";

// Pure decision: which command this message is, or null.
export function readOffSwitchCommand(event: NewMessageEvent, joeDid: string, testDmConvoId: string): OffSwitchCommand | null {
  if (event.convoId !== testDmConvoId) return null;
  if (!joeDid || event.message?.sender?.did !== joeDid) return null;
  const wholeText = String(event.message?.text ?? "").trim().toLowerCase();
  return wholeText === "off" || wholeText === "on" ? wholeText : null;
}

export type OffSwitchContext = {
  joeDid: string;
  testDmConvoId: string;
  sendContext: SendContext;
  statePath?: string; // default: state.json. Tests use a temp file
};

// Returns the command it acted on (the caller stops there), or null when the message is not a command.
// State is written FIRST, then the confirmation goes out: a crash in between leaves Homer paused, never
// un-paused. The confirmation uses the one send that ignores `paused`, so "off" is still confirmed.
export async function handleOffSwitch(event: NewMessageEvent, context: OffSwitchContext): Promise<OffSwitchCommand | null> {
  const command = readOffSwitchCommand(event, context.joeDid, context.testDmConvoId);
  if (!command) return null;
  await updateState((state) => (state.paused = command === "off"), context.statePath ?? defaultStatePath);
  await sendOffSwitchConfirmation(context.sendContext, command === "off" ? OFF_CONFIRMATION : ON_CONFIRMATION);
  return command;
}
