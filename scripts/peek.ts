// Read-only: list Homer's conversations by name, ID and status.
// Never fetches or prints message text (lastMessage is ignored on purpose).
import { readJoeDidFromTestDm } from "../src/config.ts";
import { createSession, withSessionRetry } from "../src/bluesky/session.ts";

function describeConversation(conversation: any, homerDid: string): string {
  const kind = conversation.kind;
  if (kind?.$type === "chat.bsky.convo.defs#groupConvo") {
    return `GROUP "${kind.name}" (${kind.memberCount} members)`;
  }
  const otherHandles = conversation.members
    .filter((member: any) => member.did !== homerDid)
    .map((member: any) => member.handle);
  return `DM with ${otherHandles.join(", ")}`;
}

async function listAllConversations(session: any) {
  const conversations: any[] = [];
  let cursor: string | undefined;
  do {
    const response: any = await withSessionRetry(session, () =>
      session.chatAgent.chat.bsky.convo.listConvos({ limit: 100, cursor }),
    );
    conversations.push(...response.data.convos);
    cursor = response.data.cursor;
  } while (cursor);
  return conversations;
}

async function main() {
  const session = await createSession();
  console.log(`logged in as ${session.homerHandle} (${session.homerDid})`);

  const joeDid = await withSessionRetry(session, () =>
    readJoeDidFromTestDm(session.chatAgent, session.homerDid),
  );
  console.log(`joe (from the test DM's members): ${joeDid}\n`);

  const conversations = await listAllConversations(session);
  console.log(`${conversations.length} conversations`);
  for (const conversation of conversations) {
    const description = describeConversation(conversation, session.homerDid);
    console.log(`- ${description}  id=${conversation.id}  status=${conversation.status}`);
  }
}

main().catch((error) => {
  console.error("peek failed:", error?.message ?? error);
  process.exit(1);
});
