// What scripts/acceptGroup.ts prints when it is run without the flag. Text only: no network, no files.
export const ANNOUNCED_FLAG = "--joe-has-announced";
export const LAUNCH_THEME_DAYS = 7;
export const LAUNCHD_LABEL = "com.joe.homer-bluesky";
export const RESTART_COMMAND = `launchctl kickstart -k gui/$(id -u)/${LAUNCHD_LABEL}`;

export function describeLaunchPlan(groupConvoId: string): string[] {
  return [
    "acceptGroup: DRY. Nothing was done: no login, no API call, nothing written.",
    "",
    `Run by Joe, after his own announcement in the group, with ${ANNOUNCED_FLAG}, it would:`,
    "  1. check the whole meme catalog (every entry: file present, post link resolves). Any problem -> stop here.",
    `  2. accept the group invite: chat.bsky.convo.acceptConvo for ${groupConvoId}`,
    "  3. write the launch record to state.json:",
    "       groupLaunchedAt  = now   (puts the group on the allow list and sets target \"group\")",
    `       launchThemeUntil = now + ${LAUNCH_THEME_DAYS} days   (the launch brief is added to heartbeats)`,
    "       lastHeartbeatAt  = null  (the first heartbeat in the group fires at once)",
    `  4. print the restart command: ${RESTART_COMMAND}`,
    "",
    "Homer reads the launch record only when he starts, so nothing changes until that restart.",
    "@-replies stay DM only (config.atReplyConvoIds; checklist item 30).",
    "",
    `To launch: pnpm tsx --env-file=.env scripts/acceptGroup.ts ${ANNOUNCED_FLAG}`,
  ];
}
