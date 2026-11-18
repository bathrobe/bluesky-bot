// Shared fixtures for the validatePlan tests. Invented ids and DIDs; no real chat text.
import type { PlanCheckContext } from "./planRules.ts";

export const HOMER_DID = "did:plc:homerfixture";
export const JOE_DID = "did:plc:joefixture";

export const fixtureMessages = [
  {
    id: "3msg000000001",
    text: "who wants soup",
    sender: { did: JOE_DID },
    reactions: [{ value: "💜", sender: { did: HOMER_DID } }, { value: "😂", sender: { did: JOE_DID } }],
  },
  { id: "3msg000000002", text: "@winedark.ink hello", sender: { did: JOE_DID }, reactions: [] },
];

export function makeContext(overrides: Partial<PlanCheckContext> = {}): PlanCheckContext {
  return {
    runKind: "heartbeat",
    knownMessageIds: fixtureMessages.map((message) => message.id),
    messages: fixtureMessages,
    homerDid: HOMER_DID,
    caps: { messagesPerRun: 5, reactionsPerRun: 3 },
    heartbeatMinOtherMessages: 0, // the quiet-room rule has its own test file
    ...overrides,
  };
}

export const text = (body: string, replyTo?: string) => ({ type: "text", text: body, ...(replyTo ? { replyTo } : {}) });
export const react = (messageId: string, emoji: string) => ({ type: "react", messageId, emoji });
export const planOf = (...actions: any[]) => JSON.stringify({ reason: "test", actions });
