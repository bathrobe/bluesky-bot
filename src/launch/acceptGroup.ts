// The launch step behind scripts/acceptGroup.ts, with every outside call injected so tests use fakes.
// No flag: print the plan, return 1, touch nothing (no login, no file write).
// With --joe-has-announced, in this order: catalog check -> accept the invite -> write state.json.
// Nothing here is imported by Homer's own process (main.ts); only the script calls it.
import { config } from "../config.ts";
import type { CatalogCheckResult } from "../memes/checkCatalog.ts";
import type { HomerState } from "../state.ts";
import { ANNOUNCED_FLAG, describeLaunchPlan, LAUNCH_THEME_DAYS, RESTART_COMMAND } from "./acceptGroupPlan.ts";
import { isGroupLaunched } from "./launchRecord.ts";

export type AcceptGroupDependencies = {
  stateFileExists: () => Promise<boolean>;
  loadCatalogEntries: () => Promise<any[]>;
  createSession: () => Promise<any>;
  checkFullCatalog: (session: any, entries: any[]) => Promise<CatalogCheckResult>; // full, never posted-only
  acceptGroupInvite: (session: any, convoId: string) => Promise<unknown>;
  updateState: (changeState: (state: HomerState) => void) => Promise<HomerState>;
};

// The whole launch record. Exported so tests can check it without a file.
export function writeLaunchIntoState(state: HomerState, now: Date): void {
  state.groupLaunchedAt = now.toISOString();
  state.launchThemeUntil = new Date(now.getTime() + LAUNCH_THEME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  state.lastHeartbeatAt = null; // the first heartbeat in the group fires at once
}

export async function runAcceptGroup(options: {
  commandLineArguments: string[];
  dependencies: AcceptGroupDependencies;
  now?: Date;
  printLine?: (line: string) => void;
}): Promise<number> {
  const { commandLineArguments, dependencies, now = new Date(), printLine = console.log } = options;
  const groupConvoId = config.groupConvoId;
  const unknownArguments = commandLineArguments.filter((argument) => argument !== ANNOUNCED_FLAG);
  if (unknownArguments.length > 0) {
    printLine(`unknown argument(s): ${unknownArguments.join(" ")}. usage: acceptGroup.ts [${ANNOUNCED_FLAG}]. Nothing was done.`);
    return 1;
  }
  if (!commandLineArguments.includes(ANNOUNCED_FLAG)) {
    for (const line of describeLaunchPlan(groupConvoId)) printLine(line);
    return 1;
  }

  // Local checks first: nothing has touched the network yet.
  if (!(await dependencies.stateFileExists())) {
    printLine("REFUSED: there is no state.json. Start Homer once in the DM first (it rebuilds `paused` from the chat). Nothing was done.");
    return 1;
  }
  const entries = await dependencies.loadCatalogEntries();
  if (entries.length === 0) {
    printLine("REFUSED: the meme catalog is empty. Nothing was accepted, nothing was written.");
    return 1;
  }
  const session = await dependencies.createSession();
  const catalogCheck = await dependencies.checkFullCatalog(session, entries);
  if (!catalogCheck.ok) {
    for (const entryCheck of catalogCheck.entryChecks.filter((check) => check.problems.length > 0)) {
      printLine(`FAIL  ${entryCheck.file}: ${entryCheck.problems.join("; ")}`);
    }
    printLine(`REFUSED: ${catalogCheck.problemEntryCount} catalog entr(ies) with problems. Nothing was accepted, nothing was written.`);
    return 1;
  }
  printLine(`catalog ok: ${entries.length} memes, every file present and every post resolves`);

  await dependencies.acceptGroupInvite(session, groupConvoId);
  printLine(`accepted the group invite (${groupConvoId})`);

  try {
    const writtenState = await dependencies.updateState((state) => writeLaunchIntoState(state, now));
    if (!isGroupLaunched(writtenState)) throw new Error("state.json has no readable groupLaunchedAt after the write");
    printLine(`state.json: groupLaunchedAt ${writtenState.groupLaunchedAt}, launchThemeUntil ${writtenState.launchThemeUntil}, lastHeartbeatAt cleared`);
  } catch (error: any) {
    printLine(`STATE WRITE FAILED: ${error?.message ?? error}`);
    printLine("Where things stand: the invite IS accepted (Homer is a member of the group), but state.json has no launch record,");
    printLine("so Homer is still DM only and will not read or speak in the group. Fix the cause and run this command again;");
    printLine("accepting an already accepted conversation is harmless.");
    return 1;
  }
  printLine(`now restart Homer so he picks it up: ${RESTART_COMMAND}`);
  return 0;
}
