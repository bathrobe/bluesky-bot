// Run one morning gm now, against the configured target (the test DM). Joe's test tool:
//   pnpm gm          LIVE: read the DM, call the model, send one greeting (or skip on purpose)
//   pnpm gm --dry    same, but print the plan and send nothing (writes no state)
// Unlike the scheduler, this ignores the 7–10am window. It still says gm only once per Eastern day:
// a live run after today's gm is recorded reports "already said gm today" and calls no model.
import { config } from "../src/config.ts";
import { easternDateKey } from "../src/easternDate.ts";
import { loadLaunchRecordIntoConfig } from "../src/launch/launchRecord.ts";
import { alreadySaidGmToday, runMorningGm } from "../src/runs/morningGm.ts";
import { readState } from "../src/state.ts";

function parseArguments(commandLineArguments: string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const argument of commandLineArguments) {
    if (argument === "--dry") dryRun = true;
    else throw new Error(`unknown argument "${argument}". usage: pnpm gm [--dry]`);
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArguments(process.argv.slice(2));
  await loadLaunchRecordIntoConfig(); // the group only after acceptGroup.ts
  console.log(`morning gm (${dryRun ? "dry run" : "LIVE"}), target ${config.target}`);
  console.log("manual run: the scheduler's 7–10am ET window is not checked here.");

  const state = await readState();
  if (alreadySaidGmToday(state)) {
    if (!dryRun) {
      console.log(`already said gm today (${easternDateKey()} ET, at ${state.lastGmAt ?? "unknown time"}); nothing sent.`);
      return;
    }
    console.log("note: gm already recorded today; dry run goes ahead and sends nothing.");
  }

  const result = await runMorningGm({ dryRun });
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
  console.error(`gm: ${error?.message ?? error}`);
  process.exit(1);
});
