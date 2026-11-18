// Spike: send one DM message that embeds a public post (app.bsky.embed.record).
// Run: pnpm tsx --env-file=.env scripts/spikes/sendEmbed.ts [--dry] <bsky.app post url>
// --dry resolves the link to URI + CID and prints it; nothing is sent.
import { createSession, withSessionRetry } from "../../src/bluesky/session.ts";
import { requireTestDm, testDmConvoId } from "./testDmGuard.ts";

const POST_URL_PATTERN = /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/;

async function resolvePostUrl(session: any, postUrl: string) {
  const match = postUrl.match(POST_URL_PATTERN);
  if (!match) throw new Error(`Not a bsky.app post link: ${postUrl}`);
  const [, handleOrDid, recordKey] = match;
  const authorDid = handleOrDid.startsWith("did:")
    ? handleOrDid
    : (await withSessionRetry(session, () => session.agent.resolveHandle({ handle: handleOrDid })) as any).data.did;
  const postUri = `at://${authorDid}/app.bsky.feed.post/${recordKey}`;
  // Read-only lookup on the public appview; returns the post's current CID.
  const response: any = await withSessionRetry(session, () => session.agent.getPosts({ uris: [postUri] }));
  const post = response.data.posts[0];
  if (!post) throw new Error(`Post not found: ${postUri}`);
  return { uri: post.uri as string, cid: post.cid as string, embedType: post.embed?.$type };
}

async function main() {
  const commandLineArgs = process.argv.slice(2);
  const isDryRun = commandLineArgs.includes("--dry");
  const postUrl = commandLineArgs.find((arg) => !arg.startsWith("--"));
  if (!postUrl) throw new Error("Usage: sendEmbed.ts [--dry] <bsky.app post url>");

  const session = await createSession();
  const resolvedPost = await resolvePostUrl(session, postUrl);
  console.log(`uri: ${resolvedPost.uri}`);
  console.log(`cid: ${resolvedPost.cid}`);
  console.log(`post embed type: ${resolvedPost.embedType ?? "(none)"}`);

  const messageInput = {
    text: "",
    embed: { $type: "app.bsky.embed.record", record: { uri: resolvedPost.uri, cid: resolvedPost.cid } },
  };
  if (isDryRun) {
    console.log("dry run; would send:", JSON.stringify({ convoId: testDmConvoId, message: messageInput }, null, 2));
    return;
  }
  const convoId = requireTestDm(testDmConvoId);
  const response: any = await withSessionRetry(session, () =>
    session.chatAgent.chat.bsky.convo.sendMessage({ convoId, message: messageInput }),
  );
  console.log(`sent message id: ${response.data.id}`);
  console.log("response embed:", JSON.stringify(response.data.embed, null, 2));
}

main().catch((error) => {
  console.error("sendEmbed failed:", error?.message ?? error);
  process.exit(1);
});
