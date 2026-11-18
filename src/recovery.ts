// Lost state (spec.md > Data and state, "If lost" column): what a start with no state.json can rebuild
// from the chat itself. Pure: message lists in, the recovered fields out. startUp.ts does the reading
// and writes the result once. The poll cursor needs nothing (no cursor = start from now), the start
// scan (triggers/mentionsCatchUp.ts) already finds unanswered @s, gm "may repeat once", and meme usage
// is rebuilt by hand with scripts/rebuildMemeUsage.ts.
import type { HomerState } from "./state.ts";
import { readOffSwitchCommand } from "./triggers/offSwitch.ts";

export type RecoveryInput = {
  targetConvoMessages: any[]; // recent history of the conversation heartbeats post in
  testDmMessages: any[]; // recent history of the test DM, where Joe sends off / on
  homerDid: string;
  joeDid: string;
  testDmConvoId: string;
};

export type RecoveredState = Pick<HomerState, "lastHeartbeatAt" | "paused">;

const sentAtMs = (message: any) => Date.parse(message?.sentAt ?? "");
const oldestFirst = (messages: any[]) => [...messages].sort((first, second) => sentAtMs(first) - sentAtMs(second));

// Homer's newest message (any kind) stands in for the last heartbeat, so a fresh start does not
// fire one right after he posted. No message from him in the window -> null (a heartbeat may be due).
export function findNewestHomerMessageTime(messages: any[], homerDid: string): string | null {
  const fromHomer = oldestFirst(messages).filter((message) => message?.sender?.did === homerDid && !Number.isNaN(sentAtMs(message)));
  const newest = fromHomer.at(-1);
  return newest ? new Date(sentAtMs(newest)).toISOString() : null;
}

// Joe's last `off` / `on` in the test DM, by the off switch's own rule. No command found -> not paused.
export function findLastOffSwitchCommand(testDmMessages: any[], joeDid: string, testDmConvoId: string): "off" | "on" | null {
  let lastCommand: "off" | "on" | null = null;
  for (const message of oldestFirst(testDmMessages)) {
    const command = readOffSwitchCommand({ convoId: testDmConvoId, rev: "", message, relatedProfiles: [] }, joeDid, testDmConvoId);
    if (command) lastCommand = command;
  }
  return lastCommand;
}

export function recoverLostState(input: RecoveryInput): RecoveredState {
  return {
    lastHeartbeatAt: findNewestHomerMessageTime(input.targetConvoMessages, input.homerDid),
    paused: findLastOffSwitchCommand(input.testDmMessages, input.joeDid, input.testDmConvoId) === "off",
  };
}
