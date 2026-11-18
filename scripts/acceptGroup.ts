// Launch day, run by JOE ONLY, after his own announcement in the group:
//   pnpm tsx scripts/acceptGroup.ts                                        prints the plan, exits 1, no login, no API call
//   pnpm tsx --env-file=.env scripts/acceptGroup.ts --joe-has-announced    catalog check -> accept the invite -> state.json
// An agent must never run this with the flag. The steps and their order live in src/launch/acceptGroup.ts;
// this file only wires in the real world. The accept call is here, not in src/, so Homer's own process
// (main.ts) has no code that can accept a conversation.
import { config } from "../src/config.ts";
import { createSession, withSessionRetry } from "../src/bluesky/session.ts";
import { runAcceptGroup, type AcceptGroupDependencies } from "../src/launch/acceptGroup.ts";
import { loadCatalog } from "../src/memes/catalog.ts";
import { checkCatalog } from "../src/memes/checkCatalog.ts";
import { createBlueskyPostResolver } from "../src/memes/resolvePosts.ts";
import { stateFileExists, updateState } from "../src/state.ts";

const dependencies: AcceptGroupDependencies = {
  stateFileExists: () => stateFileExists(),
  loadCatalogEntries: () => loadCatalog(),
  createSession,
  checkFullCatalog: (session, entries) =>
    checkCatalog({ entries, memeFolder: config.memeFolder, resolvePostLinks: createBlueskyPostResolver(session) }),
  acceptGroupInvite: (session, convoId) =>
    withSessionRetry(session, () => session.chatAgent.chat.bsky.convo.acceptConvo({ convoId })),
  updateState: (changeState) => updateState(changeState),
};

runAcceptGroup({ commandLineArguments: process.argv.slice(2), dependencies }).then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    console.error(`acceptGroup failed: ${error?.message ?? error}`);
    console.error("If no \"accepted the group invite\" line was printed above, the invite was not accepted and state.json was not changed.");
    process.exit(1);
  },
);
