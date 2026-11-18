// Print the transcript the model would read for the configured conversation (the test DM).
// Read-only. Output holds chat text: read it in the terminal, never paste it into committed docs.
// Run: pnpm tsx --env-file=.env scripts/showTranscript.ts
import { config } from "../src/config.ts";
import { createSession } from "../src/bluesky/session.ts";
import { fetchRecentMessages, fetchShortHandleByDid } from "../src/bluesky/history.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { buildTranscript } from "../src/transcript.ts";

function targetConvoId(): string {
  const convoId = config.target === "group" ? config.groupConvoId : config.testDmConvoId;
  if (!config.allowedConvoIds.includes(convoId)) {
    throw new Error(`Refusing conversation ${convoId}: not in config.allowedConvoIds`);
  }
  return convoId;
}

async function main() {
  await loadLaunchRecordIntoConfig(); // the group only after acceptGroup.ts
  const convoId = targetConvoId();
  const session = await createSession();
  const nowMs = Date.now();
  const shortHandleByDid = await fetchShortHandleByDid(session, convoId);
  const messages = await fetchRecentMessages(session, convoId, { nowMs });
  console.log(`conversation ${convoId}, ${messages.length} messages\n`);
  console.log(buildTranscript(messages, { nowMs, shortHandleByDid, timeZone: config.schedule.timeZone }));
}

main().catch((error) => {
  console.error("showTranscript failed:", error?.message ?? error);
  process.exit(1);
});
