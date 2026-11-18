// Spike: add one reaction to the newest test-DM message, then send one reply to it.
// Run: pnpm tsx --env-file=.env scripts/spikes/reactAndReply.ts
import { createSession, withSessionRetry } from "../../src/bluesky/session.ts";
import { requireTestDm, testDmConvoId } from "./testDmGuard.ts";

const REACTION_VALUE = "👍";
const REPLY_TEXT = "spike: reply test";

async function main() {
  const session = await createSession();
  const convoId = requireTestDm(testDmConvoId);
  const chat = session.chatAgent.chat.bsky.convo;

  const newestResponse: any = await withSessionRetry(session, () => chat.getMessages({ convoId, limit: 1 }));
  const newestMessage = newestResponse.data.messages[0];
  if (!newestMessage || newestMessage.$type !== "chat.bsky.convo.defs#messageView") {
    throw new Error(`Newest item is not a message: ${newestMessage?.$type}`);
  }
  console.log(`newest message id: ${newestMessage.id}`);

  const reactionResponse: any = await withSessionRetry(session, () =>
    chat.addReaction({ convoId, messageId: newestMessage.id, value: REACTION_VALUE }),
  );
  const reactionsNow = reactionResponse.data.message.reactions ?? [];
  console.log(`reaction added: message ${reactionResponse.data.message.id}, value ${REACTION_VALUE}`);
  console.log("reactions on it now:", JSON.stringify(reactionsNow));

  const replyResponse: any = await withSessionRetry(session, () =>
    chat.sendMessage({ convoId, message: { text: REPLY_TEXT, replyTo: { messageId: newestMessage.id } } }),
  );
  console.log(`reply sent: message ${replyResponse.data.id}`);
  console.log("reply replyTo:", JSON.stringify(replyResponse.data.replyTo?.$type), replyResponse.data.replyTo?.id);
}

main().catch((error) => {
  console.error("reactAndReply failed:", error?.message ?? error, error?.error ?? "");
  process.exit(1);
});
