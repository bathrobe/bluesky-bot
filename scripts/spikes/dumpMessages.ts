// Spike: print the raw JSON of the last 10 messages in the test DM (facets, embed, reactions, replyTo).
// Output contains DM message text: read it in the terminal, never paste it into committed docs.
// Run: pnpm tsx --env-file=.env scripts/spikes/dumpMessages.ts
import { createSession, withSessionRetry } from "../../src/bluesky/session.ts";
import { requireTestDm, testDmConvoId } from "./testDmGuard.ts";

async function main() {
  const session = await createSession();
  const convoId = requireTestDm(testDmConvoId);
  const response: any = await withSessionRetry(session, () =>
    session.chatAgent.chat.bsky.convo.getMessages({ convoId, limit: 10 }),
  );
  console.log(`homer did: ${session.homerDid}`);
  console.log(`${response.data.messages.length} messages, newest first:`);
  console.log(JSON.stringify(response.data.messages, null, 2));
}

main().catch((error) => {
  console.error("dumpMessages failed:", error?.message ?? error);
  process.exit(1);
});
