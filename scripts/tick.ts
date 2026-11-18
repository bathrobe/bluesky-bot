// Run one heartbeat now, against the configured target (the test DM).
//   pnpm tick                  LIVE: read the DM, call the model, send the plan through the Sender
//   pnpm tick --dry            same, but print the plan and send nothing (writes no state)
//   pnpm tick --note "text"    either mode, with a note from Joe appended to the run notes (DM only)
import { config } from "../src/config.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { assertOperatorNoteAllowed, runHeartbeat } from "../src/runs/heartbeat.ts";

function parseArguments(commandLineArguments: string[]): { dryRun: boolean; operatorNote?: string } {
  let dryRun = false;
  let operatorNote: string | undefined;
  for (let index = 0; index < commandLineArguments.length; index++) {
    const argument = commandLineArguments[index];
    if (argument === "--dry") dryRun = true;
    else if (argument === "--note") {
      operatorNote = commandLineArguments[++index];
      if (!operatorNote || operatorNote.startsWith("--")) throw new Error('--note needs text: --note "<text>"');
    } else throw new Error(`unknown argument "${argument}". usage: pnpm tick [--dry] [--note "<text>"]`);
  }
  return { dryRun, operatorNote };
}

async function main() {
  const { dryRun, operatorNote } = parseArguments(process.argv.slice(2));
  await loadLaunchRecordIntoConfig(); // the group only after acceptGroup.ts
  assertOperatorNoteAllowed(operatorNote);

  console.log(`heartbeat (${dryRun ? "dry run" : "LIVE"}), target ${config.target}`);
  const result = await runHeartbeat({ dryRun, operatorNote });
  if (result.outcome === "paused") {
    console.log("paused: Homer is off, so no run and no model call.");
    return;
  }
  if (result.plan) console.log(`reason: ${result.plan.reason}`);
  console.log(`outcome: ${result.outcome}`);
  if (result.error) console.log(`error: ${result.error}`);
  console.log(`log: ${result.logPath} (pnpm last)`);
  if (result.outcome === "failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`tick: ${error?.message ?? error}`);
  process.exit(1);
});
