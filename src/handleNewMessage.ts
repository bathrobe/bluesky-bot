// Where the Listener hands on each new message from an allowed conversation.
// Every event here has already passed the allow list in bluesky/poll.ts.
// Two checks, in this order (spec.md > Listener, > Message lifecycle):
//   1. off switch — Joe's `off` / `on` in the DM flips `paused`, then stop: a command is never an @
//   2. mentions   — readMentionTrigger (triggers/mentions.ts) -> the run queue's enqueueMention
// (item 26: lost-state recovery lives in main.ts, not here.)
// Each event prints one line. Message text is never printed (it is chat content).
import type { NewMessageEvent } from "./bluesky/poll.ts";
import { shortenHandle } from "./bluesky/history.ts";
import type { SendContext } from "./bluesky/send.ts";
import { config } from "./config.ts";
import type { QueuedMention } from "./runs/runQueuePick.ts";
import { readMentionTrigger } from "./triggers/mentions.ts";
import { handleOffSwitch } from "./triggers/offSwitch.ts";

export type HandleContext = {
  homerDid: string;
  joeDid: string; // from readJoeDidFromTestDm at login
  sendContext: SendContext; // for the off switch's confirmation
  // The run queue's enqueueMention: false when that @ is already waiting or being answered.
  // Left out: mentions are not queued at all.
  enqueueMention?: (mention: QueuedMention) => boolean;
  statePath?: string; // default: state.json. Tests use a temp file
  logLine?: (line: string) => void;
};

export function senderShortName(event: NewMessageEvent, homerDid: string): string {
  const senderDid = event.message.sender?.did ?? "unknown";
  if (senderDid === homerDid) return "homer";
  const profile = event.relatedProfiles.find((related: any) => related.did === senderDid);
  return profile?.handle ? shortenHandle(profile.handle) : senderDid;
}

export function describeNewMessage(event: NewMessageEvent, homerDid: string): string {
  const sentAt = event.message.sentAt ?? "?";
  return `${sentAt} new message convo=${event.convoId} from=${senderShortName(event, homerDid)} id=${event.message.id}`;
}

export async function handleNewMessage(event: NewMessageEvent, context: HandleContext): Promise<void> {
  const logLine = context.logLine ?? console.log;
  logLine(describeNewMessage(event, context.homerDid));
  // 1. Off switch, before any other trigger. An off/on message stops here.
  const { joeDid, sendContext, statePath } = context;
  const offSwitchCommand = await handleOffSwitch(event, { joeDid, testDmConvoId: config.testDmConvoId, sendContext, statePath });
  if (offSwitchCommand) {
    logLine(`off switch: ${offSwitchCommand} (paused is now ${offSwitchCommand === "off"}); confirmed in the DM`);
    return;
  }
  // 2. Mentions. Queued while paused too: @s wait for `on`. A replayed event for an @ that is already
  // waiting or running queues nothing; one that was already answered is dropped by the check before its run.
  const mention = readMentionTrigger(event, context.homerDid);
  if (!mention || !context.enqueueMention) return;
  const wasQueued = context.enqueueMention(mention);
  logLine(`mention {${mention.messageId}}: ${wasQueued ? "queued for an @-reply" : "already queued, nothing added"}`);
}
