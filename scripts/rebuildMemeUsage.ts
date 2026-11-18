// Rebuild memeLastUsed for one conversation from Homer's own meme embeds in its history.
//   pnpm tsx --env-file=.env scripts/rebuildMemeUsage.ts [--dry] [--convo <id>]
// --dry prints the result and writes nothing. Default conversation: the target (the test DM).
// Read-only on Bluesky: getMessages, plus resolving the catalog's public posts. Sends nothing.
import { config } from "../src/config.ts";
import { fetchMessagePage } from "../src/bluesky/history.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { createSession } from "../src/bluesky/session.ts";
import { loadSendableCatalog } from "../src/memes/catalog.ts";
import { collectAllMessages, fileByUriOf, rebuildMemeLastUsed } from "../src/memes/rebuildUsage.ts";
import { createBlueskyPostResolver } from "../src/memes/resolvePosts.ts";
import { targetConvoId } from "../src/runs/runDependencies.ts";
import { updateState } from "../src/state.ts";

function parseArguments(commandLineArguments: string[]): { dryRun: boolean; convoId: string } {
  let dryRun = false;
  let convoId: string | undefined;
  for (let index = 0; index < commandLineArguments.length; index++) {
    const argument = commandLineArguments[index];
    if (argument === "--dry") dryRun = true;
    else if (argument === "--convo") {
      convoId = commandLineArguments[++index];
      if (!convoId) throw new Error("--convo needs a conversation id");
    } else throw new Error(`unknown argument "${argument}". usage: rebuildMemeUsage.ts [--dry] [--convo <id>]`);
  }
  convoId ??= targetConvoId();
  // Checked before anything is read: only an allowed conversation may be scanned.
  if (!config.allowedConvoIds.includes(convoId)) throw new Error(`Refusing conversation ${convoId}: not in config.allowedConvoIds`);
  return { dryRun, convoId };
}

async function main() {
  await loadLaunchRecordIntoConfig(); // the group only after acceptGroup.ts
  const { dryRun, convoId } = parseArguments(process.argv.slice(2));
  const session = await createSession();
  const { sendableMemes } = await loadSendableCatalog(createBlueskyPostResolver(session));
  const messages = await collectAllMessages((cursor) => fetchMessagePage(session, convoId, cursor));
  const lastUsedByFile = rebuildMemeLastUsed(messages, session.homerDid, fileByUriOf(sendableMemes));

  const newestFirst = Object.entries(lastUsedByFile).sort(([, timeA], [, timeB]) => Date.parse(timeB) - Date.parse(timeA));
  console.log(`conversation ${convoId}: scanned ${messages.length} messages, ${sendableMemes.length} sendable memes in the catalog`);
  for (const [file, sentAt] of newestFirst) console.log(`  ${sentAt}  ${file}`);
  console.log(`${newestFirst.length} meme(s) used`);

  if (dryRun) {
    console.log("--dry: state.json not changed");
    return;
  }
  await updateState((state) => {
    state.memeLastUsed[convoId] = lastUsedByFile;
  });
  console.log(`wrote memeLastUsed for ${convoId} to state.json`);
}

main().catch((error) => {
  console.error(`rebuildMemeUsage: ${error?.message ?? error}`);
  process.exit(1);
});
