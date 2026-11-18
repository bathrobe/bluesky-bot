# Homer under launchd

`homer.plist` runs Homer as a per-user LaunchAgent, label `com.joe.homer-bluesky`: it starts at login and
restarts after a crash (at most once a minute). Output goes to `logs/launchd.log` (ignored by git via `logs/`).

Installed as a **copy** at `~/Library/LaunchAgents/com.joe.homer-bluesky.plist`. After editing `homer.plist`,
copy it again and reload (stop, then start).

```sh
# install (once)
cp launchd/homer.plist ~/Library/LaunchAgents/com.joe.homer-bluesky.plist

# start (load)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.joe.homer-bluesky.plist

# stop (unload; `kill` alone does not stop him, launchd starts him again)
launchctl bootout gui/$(id -u)/com.joe.homer-bluesky

# restart (e.g. after a code change, or after scripts/acceptGroup.ts)
launchctl kickstart -k gui/$(id -u)/com.joe.homer-bluesky

# is he running? (a number in the first column is the PID)
launchctl list | grep com.joe.homer-bluesky

# watch the log
tail -f logs/launchd.log
```

- A stopped job comes back at the next login. To keep him off for good, also delete the copy in
  `~/Library/LaunchAgents/`. To silence him without stopping the process, send `off` in the test DM.
- Do not run `pnpm start` in a terminal while the job is loaded: that would be two Homers.
- The plist holds no secrets. `.env` is read by node from the repo folder.
- The group: Homer is DM only until Joe runs `scripts/acceptGroup.ts --joe-has-announced` and restarts him.
