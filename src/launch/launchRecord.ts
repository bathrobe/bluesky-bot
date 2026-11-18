// The launch record: ONE field in state.json, `groupLaunchedAt`, decides whether Homer may touch the group.
//   missing / null / not a readable date  -> DM only (target "dm", allow list = [test DM]). Today's behaviour.
//   an ISO time                           -> target "group", allow list = [test DM, group].
// The only code that writes it is scripts/acceptGroup.ts, behind --joe-has-announced and a clean catalog
// check. Lost-state recovery (startUp.ts / recovery.ts) never sets it, so a lost state.json after launch
// falls back to DM only: the safe direction. `atReplyConvoIds` is never changed here (item 30 is Joe's).
//
// config.ts keeps the DM-only defaults. A process copies the record into `config` once, at start
// (loadLaunchRecordIntoConfig), so a running Homer picks up a launch only after a restart.
import { config, GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { defaultStatePath, readState } from "../state.ts";

export type LaunchSettings = { target: "dm" | "group"; allowedConvoIds: string[] };

export function isGroupLaunched(state: { groupLaunchedAt?: unknown }): boolean {
  const launchedAt = state?.groupLaunchedAt;
  return typeof launchedAt === "string" && launchedAt.length > 0 && !Number.isNaN(Date.parse(launchedAt));
}

// Pure: state in, settings out. This is the only place the group ID is put on an allow list.
export function launchSettingsFromState(state: { groupLaunchedAt?: unknown }): LaunchSettings {
  if (!isGroupLaunched(state)) return { target: "dm", allowedConvoIds: [TEST_DM_CONVO_ID] };
  return { target: "group", allowedConvoIds: [TEST_DM_CONVO_ID, GROUP_CONVO_ID] };
}

// Overwrites (never appends to) the two settings, so applying a "not launched" state resets to DM only.
export function applyLaunchRecord(state: { groupLaunchedAt?: unknown }, configToChange: LaunchSettings = config): LaunchSettings {
  const settings = launchSettingsFromState(state);
  configToChange.target = settings.target;
  configToChange.allowedConvoIds = settings.allowedConvoIds;
  return settings;
}

// Called once at the top of main.ts and of the scripts that follow `target` (tick, gm, showTranscript,
// rebuildMemeUsage). A missing state.json reads as defaults, so it means DM only.
export async function loadLaunchRecordIntoConfig(statePath = defaultStatePath, logLine: (line: string) => void = console.log): Promise<LaunchSettings> {
  const state = await readState(statePath);
  const settings = applyLaunchRecord(state);
  if (state.groupLaunchedAt && settings.target === "dm") {
    logLine(`state.json groupLaunchedAt is not a readable date ("${state.groupLaunchedAt}"): staying DM only`);
  }
  return settings;
}
