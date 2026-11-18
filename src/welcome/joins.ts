// Joins: the system messages Bluesky writes when someone is added to the group or joins by link.
// Pure. Used by the transcript (so a join reads "X joined" instead of "(empty)") and the welcome run.
export const SYSTEM_MESSAGE_TYPE = "chat.bsky.convo.defs#systemMessageView";
const ADD_MEMBER_TYPE = "chat.bsky.convo.defs#systemMessageDataAddMember";
const MEMBER_JOIN_TYPE = "chat.bsky.convo.defs#systemMessageDataMemberJoin";
const LEAVE_TYPES = ["chat.bsky.convo.defs#systemMessageDataMemberLeave", "chat.bsky.convo.defs#systemMessageDataRemoveMember"];

export const isSystemMessage = (message: any) => message?.$type === SYSTEM_MESSAGE_TYPE;

// The DID of whoever joined, or null when the message is not a join.
export function joinedMemberDid(message: any): string | null {
  if (!isSystemMessage(message)) return null;
  const dataType = message.data?.$type;
  return dataType === ADD_MEMBER_TYPE || dataType === MEMBER_JOIN_TYPE ? (message.data.member?.did ?? null) : null;
}

// One transcript body for a system message: "rook joined (added by joe)", "rook left".
export function describeSystemMessage(message: any, nameForDid: (did: string) => string): string {
  const data = message.data ?? {};
  const memberName = nameForDid(data.member?.did);
  if (data.$type === ADD_MEMBER_TYPE) return `${memberName} joined (added by ${nameForDid(data.addedBy?.did)})`;
  if (data.$type === MEMBER_JOIN_TYPE) return `${memberName} joined`;
  if (LEAVE_TYPES.includes(data.$type)) return `${memberName} left`;
  return "(group update)";
}

export type Newcomer = { did: string; shortName: string; joinedAt: string };

// Who joined in the last `withinHours` and has not been welcomed. Someone no longer in the chat
// (left again) is left out, and so is Homer. `messages` are oldest first.
export function findNewcomers(input: {
  messages: any[];
  welcomedDids: string[];
  shortHandleByDid: Record<string, string>; // the chat's current members
  homerDid: string;
  nowMs: number;
  withinHours?: number;
}): Newcomer[] {
  const { shortHandleByDid, homerDid, nowMs, withinHours = 24 } = input;
  const welcomed = new Set(input.welcomedDids);
  const newcomerByDid = new Map<string, Newcomer>();
  for (const message of input.messages) {
    const did = joinedMemberDid(message);
    if (!did || did === homerDid || welcomed.has(did) || !(did in shortHandleByDid)) continue;
    if (nowMs - Date.parse(message.sentAt) > withinHours * 3_600_000) continue;
    newcomerByDid.set(did, { did, shortName: shortHandleByDid[did], joinedAt: message.sentAt });
  }
  return [...newcomerByDid.values()];
}
