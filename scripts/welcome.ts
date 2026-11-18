// Dry-run the welcome on a member who is already in the chat, as if they just joined. Sends nothing,
// writes no state. Calls the model with their public display name and bio.
//   pnpm tsx --env-file=.env scripts/welcome.ts <did>
//   pnpm tsx --env-file=.env scripts/welcome.ts mark-all-welcomed   (stop Homer first: writes state.json)
import { createSession } from "../src/bluesky/session.ts";
import { fetchShortHandleByDid } from "../src/bluesky/history.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { targetConvoId } from "../src/runs/runDependencies.ts";
import { runWelcome } from "../src/runs/welcome.ts";
import { updateState } from "../src/state.ts";

async function main() {
  const [argument] = process.argv.slice(2);
  if (!argument) throw new Error("pass a member DID, or mark-all-welcomed");
  await loadLaunchRecordIntoConfig();
  if (argument === "mark-all-welcomed") {
    const memberDids = Object.keys(await fetchShortHandleByDid(await createSession(), targetConvoId()));
    const state = await updateState((current) => { current.welcomedDids = [...new Set([...current.welcomedDids, ...memberDids])]; });
    return console.log(`${state.welcomedDids.length} members marked welcomed`);
  }
  const result = await runWelcome({ dryRun: true, treatAsNewDids: [argument] });
  console.log("outcome:", result.outcome, "logPath" in result ? result.logPath : "");
}

main().catch((error) => {
  console.error("welcome failed:", error?.message ?? error);
  process.exit(1);
});
