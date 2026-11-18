# Homer build checklist

Source: `prd.md`, `spec.md`, and the `/checklist` interview (2026-11-14).

## Build preferences

- **Mode:** autonomous. One subagent per item, in order, one at a time.
- **Agent:** each item names its model (`opus` = Opus 5.5, `fable` = Fable 5.2). Dispatch with that model.
- **Ticking:** the subagent checks its own box in this file, in the same commit as its work, only after Verify passes.
- **Verification:** on. An item whose Verify fails is not ticked; the build stops (see `/build > When something breaks`).
- **Pauses:** only at the three 🛑 STOP sections. This replaces "pause every 3–4 items".
- **Comprehension checks:** off.
- **Git:** one commit per item, on `master`. Item 1 commits the Python v0 first so it stays recoverable.
- **Narration:** one line per finished item. Full detail only at a STOP or a failure.
- **Meme catalog:** not on this list. Joe works on it in a separate track; it blocks item 29 only.

## Rules for every subagent

- Read the item, its spec ref, and the PRD behavior it names. Read `docs/spike-notes.md` if it exists.
- Code style: functions, not classes; long readable names; every file under 100 lines; loose types are fine.
- The only conversation anything may be sent to is the test DM, `3myzmduu7x32v`.
- Never read, send to, or accept the group (`3myuetafuyt2i`). Never create a public post, like, follow or reply.
- Never print or commit `.env` values, `state.json`, or `logs/`.
- Report: what was built, the Verify output, anything that could not be verified.

## Before the build starts (Joe)

- Add `INFERENCE_API_KEY` to `.env`. Today it holds only the Bluesky pair and `OPENROUTER_API_KEY`. Item 2 fails without it.

## Checklist

### Phase A — foundations and spikes

- [x] **1. Fresh TypeScript project — v0 is gone and `pnpm peek` lists Homer's conversations**
  Agent: `opus`
  Spec ref: `spec.md > Stack`, `spec.md > Runtime`, `spec.md > File structure`
  Build: Commit the repo as it stands (v0 + docs). Then delete `*.py`, `pyproject.toml`, `uv.lock`, `.python-version`, `.venv/`, `persona.md`, `cursor.txt`. Add `package.json` (pnpm, ESM; scripts `start`, `peek`, `tick`, `gm`, `last`, `test`), `tsconfig.json`, and deps `@atproto/api@0.32.0`, `zod`, `yaml`, `tsx`, `vitest`. Load `.env` with Node's `--env-file`. Write `src/config.ts` (DM ID, `allowedConvoIds = [DM]`, `target: "dm"`, model, base URL, caps, schedule, Joe's DID read from the DM's member list), `src/bluesky/session.ts` (log in, chat-proxied client, log in again on an auth error and retry once), `scripts/peek.ts` (conversation name, ID, status only; no message text). Update `.gitignore` (`node_modules`, `.env`, `state.json`, `logs/`) and `.env.example` (`INFERENCE_API_KEY` replaces `OPENROUTER_API_KEY`).
  Acceptance: the project runs with no Python left, and nothing reads message text from the group.
  Verify: `pnpm peek` prints the test DM `3myzmduu7x32v` and the group with status `request`. `pnpm exec tsc --noEmit` exits 0. `ls *.py` finds nothing.

- [x] **2. Spike: tool calling works through the gateway**
  Agent: `opus`
  Spec ref: `spec.md > Open issues > Tool calling through the gateway`
  Build: `scripts/spikes/toolCall.ts`. One `fetch` to `https://gateway.inference.coop/v1/chat/completions`, model `tinfoil/deepseek-v4-1-flash`, one dummy `post` tool, `parallel_tool_calls: false`. Then a second turn that sends a tool result back. Print whether each turn returned a parseable tool call, the model ID the gateway reports, token usage, and any rate-limit headers. Write the findings to `docs/spike-notes.md` under `## Tool calling`.
  Acceptance: the look-then-`post` design is possible on this model.
  Verify: `pnpm tsx scripts/spikes/toolCall.ts` prints `turn 1 tool call: ok` and `turn 2 tool call: ok`. If either fails, stop the build: the provider choice goes back to Joe.

- [x] **3. Spike scripts: send an embed, a reaction and a reply to the DM, and dump raw messages**
  Agent: `opus`
  Spec ref: `spec.md > Open issues > Meme embed preview`, `spec.md > Open issues > Mentions in chat`
  Build: `scripts/spikes/sendEmbed.ts <post url>` resolves a bsky.app link to URI + CID and sends one DM message with `embed: app.bsky.embed.record` (`--dry` resolves and prints without sending). `scripts/spikes/dumpMessages.ts` prints the raw JSON of the last 10 DM messages (facets, embed, reactions, `replyTo`). `scripts/spikes/reactAndReply.ts` adds one reaction to the newest DM message and sends one reply to it. Record the exact request shapes that worked in `docs/spike-notes.md` under `## Chat shapes`.
  Acceptance: the send shapes the Sender will use are known from real calls, not from the types.
  Verify: `pnpm tsx scripts/spikes/sendEmbed.ts --dry <any public image post>` prints a URI and CID. `reactAndReply.ts` prints two message/reaction IDs. `dumpMessages.ts` shows that reaction and that `replyTo` in the JSON.

### 🛑 STOP 1 — Joe in the test DM (about 5 minutes)

- [x] **4. Joe confirms memes preview in chat and mentions carry a facet**
  Agent: main session, with Joe
  Spec ref: `spec.md > Open issues` (embed preview, mentions in chat)
  Build: Joe posts at least 3 memes to Homer's profile by hand and pastes the links. The main session runs `sendEmbed.ts` with one of them. Joe sends "@winedark.ink hello" in the DM from the app, picking the handle from autocomplete if the app offers it. The main session runs `dumpMessages.ts`. Write both answers to `docs/spike-notes.md` and update `spec.md > Open issues`.
  Acceptance: `prd.md > Meme drop` ("the image previews in chat") and `prd.md > @-reply` ("a real Bluesky mention") are each confirmed or marked broken.
  Verify: Joe says whether the image shows in the app. The dump shows, or does not show, a `app.bsky.richtext.facet#mention` holding Homer's DID. No preview → stop; the meme design needs rework. No facet → carry on; items 24–25 wait for a new trigger decided with Joe.

### Phase B — one heartbeat, dry then live

- [x] **5. State and run log — `state.json` survives a crash and every run leaves a readable log**
  Agent: `opus`
  Spec ref: `spec.md > Data and state`, `spec.md > Run log`
  Build: `src/state.ts` (read with defaults; write to a temp file then rename). `src/log.ts` (writes `logs/<ISO time>-<trigger>.json`, pretty-printed, with the fields the spec lists). `scripts/last.ts` prints the newest log. Tests for state defaults, round trip, and a missing file.
  Acceptance: `prd.md > Operator controls` — Joe can see what Homer saw and why.
  Verify: `pnpm test state` passes. After writing a sample log from the test, `pnpm last` prints it.

- [x] **6. History and transcript — the model reads the DM as clean lines with message IDs**
  Agent: `opus`
  Spec ref: `spec.md > Run pipeline` (step 1)
  Build: `src/bluesky/history.ts` (the last 100 messages, none older than 7 days; a page-back function for later). `src/transcript.ts`, ported from `~/Developer/archive/homer/src/transcript.ts`: short handle, time, text, reply arrow, reactions folded onto their target, message ID in braces, Homer shown as `homer`. `scripts/showTranscript.ts` prints the DM transcript. Tests on fixture messages built from the raw shapes in `docs/spike-notes.md`.
  Acceptance: `prd.md > Callback` — old messages can be pointed at by a real ID.
  Verify: `pnpm test transcript` passes. `pnpm tsx scripts/showTranscript.ts` prints the DM oldest first, each line ending in `{id}`, with the reaction from item 3 folded onto its message.

- [x] **7. Prompts — Homer's voice, minus everything the PRD removes**
  Agent: `fable`
  Spec ref: `spec.md > Prompts`, `prd.md > Persona`
  Build: `prompts/SYSTEM.md` from `~/Developer/archive/homer/skills/SYSTEM.md` with the PRD remove list applied; tool section rewritten for look-then-`post`; one statement that he cannot remember why he posted or reacted before. `prompts/heartbeat.md` from Signal Homer's `skills/heartbeat.md` (reaction on nearly every tick, one substantive move, artifact over commentary, skipping allowed). `src/prompt.ts` joins `SYSTEM.md` + `---` + a skill file, no template variables.
  Acceptance: `prd.md > Persona` — the keep list is intact and nothing on the remove list survives.
  Verify: `grep -ilE "wine dark|signal|twitter|orality|people notes|generate_image|remix|90 days" prompts/*` prints nothing. Joe reads `SYSTEM.md` at STOP 2.

- [x] **8. Model client and text cleaning — one call that fails loudly and retries sanely**
  Agent: `opus`
  Spec ref: `spec.md > Run pipeline` (`llm/client.ts`), `spec.md > Runtime` (sleep mid-request)
  Build: `src/llm/client.ts`: one `fetch` with `tools` and `parallel_tool_calls: false`; 120s timeout; two attempts; retry only on transport errors and 408/429/5xx; an empty reply or `finish_reason` of `length` / `content_filter` is an error; a call whose wall-clock time far exceeds its timeout is discarded and retried. `src/cleanText.ts` from `stripControlTokens` in `~/Developer/archive/homer/src/safety/proxy.ts`, plus literal `\n`. Tests with a mocked `fetch`.
  Acceptance: a bad or truncated model reply can never be sent as a message.
  Verify: `pnpm test client cleanText` passes, including the 429-retry, the `length` error, and the sleep case.

- [x] **9. The `post` tool and plan check — every hard rule that needs no meme data**
  Agent: `opus`
  Spec ref: `spec.md > The post tool`, `spec.md > Plan check`
  Build: `src/tools/post.ts` (zod schema for `reason` + `actions`). `src/plan/validatePlan.ts` with these rules: send cap (5 text+meme, 3 react), real message IDs only, no repeat reactions, text hygiene, gm shape, @-reply shape. Each failure returns error text written for the model. `meme` actions are rejected with "no catalog yet" until item 15. One test per rule, pass and fail.
  Acceptance: `prd.md > Hard rules` are enforced in code, not in the prompt.
  Verify: `pnpm test validatePlan` passes with at least one failing-case test per row of the Plan check table except the two meme rows.

- [x] **10. Tool loop — the model must end in a valid `post` or the run fails**
  Agent: `fable`
  Spec ref: `spec.md > Run pipeline` (steps 3–4)
  Build: `src/llm/toolLoop.ts`: step cap of 8 model turns; a plain-text answer is re-prompted once, then fails; a rejected plan goes back as the tool result with nothing sent; two rejected plans in a row fail the run; a slot for lookup tools with a shared cap of 4 (none registered yet). Returns the valid plan plus every turn for the log. Tests with a scripted fake client.
  Acceptance: no path through the loop produces a send without a plan that passed the check.
  Verify: `pnpm test toolLoop` passes: happy path, plain-text re-prompt, one rejection then success, two rejections fail, step cap fails.

- [x] **11. Dry heartbeat — `pnpm tick --dry` reads the real DM and prints what Homer would do**
  Agent: `fable`
  Spec ref: `spec.md > Run pipeline`, `spec.md > Heartbeat`, `spec.md > Testing and dry runs`
  Build: `src/runs/runShared.ts` (context → prompt → loop → plan check → execute → record). `src/runs/heartbeat.ts` notes: time of day, time since anyone spoke, Homer's share of the last 20 messages, "someone said your name" messages since the last tick, "nobody has spoken since your last post". `src/plan/executePlan.ts`, dry mode only: prints each action. `scripts/tick.ts` with `--dry` and `--note "<text>"` (appended to the run notes; refused when `target` is `group`). Without `--dry` it exits with "live sends arrive in item 12".
  Acceptance: `prd.md > Heartbeat` — he glances at the room and picks one move; nothing is sent.
  Verify: `pnpm tick --dry` prints a `reason` and an action list (or a skip). `pnpm last` shows outcome `dry`, the full first user message, and each model turn. The DM has no new message.

- [x] **12. Sender and live tick — Homer posts and reacts in the DM, and can post nowhere else**
  Agent: `fable`
  Spec ref: `spec.md > Sender`, `spec.md > Run pipeline` (steps 5–6)
  Build: `src/bluesky/send.ts` with `sendText`, `addReaction`, `sendMemeEmbed`, `sendOperatorAlert` (fixed to the DM), using the shapes in `docs/spike-notes.md`. Each throws if the conversation is not in `config.allowedConvoIds` and returns without sending if `paused`. `executePlan` live mode: actions in order; a send error is logged and the remaining actions dropped. Record `lastHeartbeatAt` and write the log with sent message IDs. Tests with a fake agent.
  Acceptance: `prd.md > Hard rules` — only allowed conversations; nothing public. `prd.md > Emoji reaction` — a reaction lands on a real message.
  Verify: `pnpm test send` passes, including "throws for `3myuetafuyt2i`" and "sends nothing when paused". `grep -rnE "sendMessage|addReaction|createRecord|\.post\(|\.like\(|\.follow\(" src | grep -v bluesky/send.ts` prints nothing. `pnpm tick` puts a message or reaction in the DM and `pnpm last` shows outcome `posted` with its ID.

### 🛑 STOP 2 — Joe plays with Homer in the DM

- [x] **13. Joe has run live ticks in the DM and his notes are dealt with**
  Agent: main session, with Joe
  Spec ref: `spec.md > Testing and dry runs` (step 3)
  Build: Joe talks in the DM, runs `pnpm tick` and `pnpm tick --note "..."` as much as he likes, reads `prompts/SYSTEM.md` and a few `pnpm last` logs. The main session fixes what he reports (prompt edits, transcript format, bugs) and commits.
  Acceptance: `prd.md > Heartbeat > Working when` — Joe's judgment call that the voice and the choice of move are right enough to keep building on.
  Verify: Joe says "go".

### Phase C — memes

- [x] **14. Catalog loader and checker — a small real catalog loads, and bad entries are named**
  Agent: `opus`
  Spec ref: `spec.md > Meme catalog and usage` (entry shape, step 4)
  Build: `memes/catalog.yaml` already exists (118 entries exported from the Meme Wall on 2026-11-14; `post` and `notes` are optional and `post` is mostly absent). Do not rewrite its text; only add the `post` links Joe gave at STOP 1 to those entries. `src/memes/catalog.ts`: load with `yaml` + zod; entries with no `post` are loaded but left out of the prompt and cannot be sent; resolve each `post` link to URI + CID once at startup, in memory; render the catalog text for the prompt with a `fresh` / `spent` tag per entry. `scripts/checkCatalog.ts`: report entries with no file in `config.memeFolder` (`~/Pictures/Memes`), no `post`, or a post that does not resolve. Exit non-zero on any problem. `--posted-only` checks just the entries that have a `post`.
  Acceptance: `prd.md > Meme drop > Edge cases` — only entries with a known public post can be sent.
  Verify: `pnpm tsx scripts/checkCatalog.ts --posted-only` prints each posted entry as ok and exits 0. Without the flag it lists the unposted entries and exits 1. With a made-up entry added, it names that entry (remove it afterwards).

- [x] **15. Meme cooldown — no meme repeats while unused ones remain, with one deliberate exception**
  Agent: `fable`
  Spec ref: `spec.md > Meme catalog and usage > Cooldown rule`, `spec.md > Plan check` (meme rows)
  Build: `src/memes/usage.ts`, per conversation: `spent` if used here while any never-used meme remains; when all are used, the least recently used quarter becomes `fresh`; on-the-nose override accepted only with `onTheNose.why`, last use over 30 days ago, and no override in the last 7 days. Add "meme exists" and "meme cooldown" to `validatePlan`, replacing the item 9 stub. Tests for each branch, and that DM use does not spend a meme for the group.
  Acceptance: `prd.md > Meme drop > Working when` — no meme repeats while unused ones remain.
  Verify: `pnpm test usage validatePlan` passes: fresh accepted, spent rejected, quarter refresh, override accepted, override refused inside 30 days, second override refused inside 7 days, unknown file gets "not in the catalog".

- [x] **16. Live meme drop — Homer sends a catalog meme into the DM and remembers he used it**
  Agent: `opus`
  Spec ref: `spec.md > Sender` (meme embed), `spec.md > Meme catalog and usage > In the prompt`, `spec.md > Data and state` (`memeLastUsed`)
  Build: Add the tagged catalog to the first user message for heartbeats. `executePlan` sends `meme` actions through `sendMemeEmbed` and writes `memeLastUsed` (and `lastOverrideAt`) per conversation. `scripts/rebuildMemeUsage.ts` rebuilds `memeLastUsed` by scanning Homer's own embeds in a conversation (`--dry` prints the result).
  Acceptance: `prd.md > Meme drop` — the link to the meme's public post is sent so the image previews; the image is the move.
  Verify: `pnpm tick --note "drop a meme this time"` puts an embed in the DM. `state.json` lists that file under the DM. `pnpm tsx scripts/rebuildMemeUsage.ts --dry` prints the same file. A second identical tick picks a different meme.

### Phase D — Homer runs on his own in the DM

- [x] **17. Poll loop — one long-running process that follows the chat and never exits on an error**
  Agent: `opus`
  Spec ref: `spec.md > Listener`, `spec.md > Runtime` (network loss, sleep)
  Build: `src/bluesky/poll.ts`: `getLog({cursor})`; drop events from conversations not on the allow list before anything else; pass on only `logCreateMessage`; with no cursor, start from "now". `src/main.ts`: log in, poll every 30s, save the cursor after the batch is handled, back off 30s doubling to 5 min on any failure including 429. For now each event prints one line. Tests for the filter and the backoff steps.
  Acceptance: `prd.md > Hard rules` — only allowed conversations are ever looked at.
  Verify: `pnpm test poll` passes, including "group event is dropped". With `pnpm start` running, `pnpm tick` in another shell makes the process print Homer's own new message within 30s. Stop and restart: no old event is printed twice.

- [x] **18. Off switch — `off` and `on` from Joe in the DM pause and resume everything**
  Agent: `opus`
  Spec ref: `spec.md > Off switch`
  Build: `src/triggers/offSwitch.ts`: a DM message from Joe's DID whose whole text is `off` or `on` (any case) flips `paused`; Homer confirms with one line. Check `paused` before a run starts and before the model call (the Sender already checks). `sendOperatorAlert` limited to one per day via `lastAlertDate`. Tests on fixture events.
  Acceptance: `prd.md > Operator controls` — Joe can turn Homer off at any time, from his phone.
  Verify: `pnpm test offSwitch` passes: Joe's `OFF` pauses; `off please` does not; `off` from another DID does not; `off` in another conversation does not. The live check from Joe's phone is in item 28.

- [x] **19. Scheduler — heartbeat and gm come due at the right minutes, in Eastern time**
  Agent: `opus`
  Spec ref: `spec.md > Scheduler`
  Build: `src/triggers/schedule.ts`, time math ported from `~/Developer/archive/homer/src/runner/time.ts`. Heartbeat due: 6:30am–midnight ET, 5 hours since `lastHeartbeatAt`, 1 hour since the last gm, not paused. Gm due: today's random minute (7:00–9:00 ET, picked once a day) has passed, before 10:00, none today, 1 hour since the last heartbeat, not paused. Three failed attempts in a window marks the tick done and alerts Joe. `config.heartbeatIntervalMinutes` allows a short interval while `target` is `dm`.
  Acceptance: `prd.md > Heartbeat > Edge cases` and `prd.md > Morning gm > Edge cases` — missed ticks and mornings are never made up.
  Verify: `pnpm test schedule` passes: inside and outside the window, both DST change days, the gm/heartbeat one-hour gap, paused, a wake after 14 hours yields one heartbeat and no gm, three failures alert once.

- [x] **20. Run queue — Homer lives in the DM, one run at a time**
  Agent: `fable`
  Spec ref: `spec.md > Run queue`, `spec.md > Architecture overview`
  Build: `src/runs/runQueue.ts`: one run at a time; order heartbeat, gm, then @s oldest first; 60s between two @-reply runs; nothing taken while paused. Wire `main.ts`: scheduler checked every minute → queue → heartbeat run. Tests for ordering and no overlap.
  Acceptance: `prd.md > When behaviors collide` — he stays quiet rather than stacking posts.
  Verify: `pnpm test runQueue` passes. With `heartbeatIntervalMinutes: 3`, `pnpm start` for 7 minutes writes exactly two heartbeat logs whose time ranges do not overlap. Set the interval back afterwards.

- [x] **21. Lookups — Homer can search the chat's past and public Bluesky before he posts**
  Agent: `opus`
  Spec ref: `spec.md > Lookup tools`
  Build: `src/tools/searchChat.ts` (`{keywords, before?}`; pages back 100 at a time, up to 30 pages; returns ID, sender, date, text, or "no matches"). `src/tools/searchBluesky.ts` (`app.bsky.feed.searchPosts`, up to 10 posts: handle, text, link; read-only). Register both in the tool loop under the shared cap of 4. IDs returned by `search_chat` count as real for the plan check. Tests with fake pages.
  Acceptance: `prd.md > Callback > Working when` — the old message is real. `prd.md > Callback > Edge cases` — if the search finds nothing he says so.
  Verify: `pnpm test searchChat` passes. `pnpm tick --dry --note "find the oldest message here containing 'smaller' and quote-reply it"` → `pnpm last` shows a `search_chat` call and a `replyTo` equal to an ID from its result. `pnpm tick --dry --note "bring one bluesky post about horses"` shows a `search_bluesky` call and a link in the plan.

- [x] **22. Morning gm — one short greeting, or a deliberate skip**
  Agent: `opus`
  Spec ref: `spec.md > Morning gm`
  Build: `src/runs/morningGm.ts`, `prompts/morning-gm.md` from Signal Homer's `skills/morning-gm.md`, `scripts/gm.ts` with `--dry`. Wire gm into the queue. Records `lastGmDate`.
  Acceptance: `prd.md > Morning gm` — one short lowercase greeting; skips if the room is tense.
  Verify: `pnpm gm --dry` prints one lowercase `text` action or an empty plan. `pnpm gm` sends it to the DM; a second `pnpm gm` the same day reports "already said gm today".

- [x] **23. Launch brief — while the launch theme is on, heartbeats carry the facts he must get right**
  Agent: `opus`
  Spec ref: `spec.md > Launch announcements`
  Build: `prompts/launch.md` in plain statements: he is a bot; he reads the whole chat from the day he joined; what he can do; when he runs; chat text goes to `tinfoil/deepseek-v4-1-flash` in an encrypted enclave through inference.coop; anyone who finds that weird is free to leave. `config.launchThemeUntil`; `heartbeat.ts` adds the brief while that date is in the future.
  Acceptance: `prd.md > Launch announcements > Working when` — a member who reads one day of chat that week knows a bot is present and reading.
  Verify: with `launchThemeUntil` set to tomorrow, `pnpm tick --dry` then `pnpm last` shows the brief in the first user message. Set to yesterday: absent. Leave it unset.

- [x] **24. Mention trigger — a real @ is queued once; his bare name is not**
  Agent: `fable`
  Spec ref: `spec.md > @-reply` (trigger, already answered, budget). Depends on item 4's finding.
  Build: `src/triggers/mentions.ts`: a message in a conversation listed in `config.atReplyConvoIds` (DM only for now) with a mention facet holding Homer's DID; never Homer's own messages. Already-answered check: a Homer message whose `replyTo` is the mention, or the ID in `skippedMentionIds`. Budget: 4 answered in 15 minutes per conversation, then one brush-off, then skipped without a model call. Tests on fixtures shaped like item 4's dump.
  Acceptance: `prd.md > @-reply > Trigger` — a real mention and nothing else.
  Verify: `pnpm test mentions` passes: facet with Homer's DID queues; "homer" as plain text does not; a facet for another DID does not; already-replied drops; the fifth @ in 15 minutes is a brush-off and the sixth is skipped.

- [x] **25. @-reply run and catch-up — every @ gets one answer or a deliberate skip**
  Agent: `fable`
  Spec ref: `spec.md > @-reply`, `spec.md > Message lifecycle`
  Build: `src/runs/atReply.ts` (notes: the mentioning message and its age), `prompts/at-reply.md` from Signal Homer's `skills/at-reply.md`. An empty plan records the ID in `skippedMentionIds`. Wire the listener's mention check into the queue. Catch-up comes from the saved cursor, oldest first. Add the catalog to @-reply prompts.
  Acceptance: `prd.md > @-reply > Working when` — every @ gets an answer or a deliberate skip, and none is answered twice.
  Verify: `pnpm test atReply` passes with a fake client: reply carries `replyTo` = the @; a skip is recorded; replaying the same event queues nothing. Live check with Joe's real mentions is in item 28.

- [x] **26. Lost state — deleting `state.json` costs nothing that matters**
  Agent: `opus`
  Spec ref: `spec.md > Data and state` ("If lost" column)
  Build: On start with no state: cursor begins at "now" and the last 100 messages are scanned for unanswered @s; `lastHeartbeatAt` is taken from Homer's newest message; `paused` is rebuilt from Joe's last `off` / `on` in the DM. Tests on fixture histories.
  Acceptance: `prd.md > Operator controls` — an `off` stays off even if the state file is lost.
  Verify: `pnpm test recovery` passes: last DM command `off` → starts paused; newest Homer message 2 hours old → no heartbeat due; one unanswered @ in the last 100 → queued once.

- [x] **27. launchd and the launch script — Homer restarts himself, and the group step is ready but not run**
  Agent: `fable`
  Spec ref: `spec.md > Runtime` (before group launch), `spec.md > Launch announcements` (`acceptGroup.ts`)
  Build: `launchd/homer.plist` (start at login, restart on crash, logs to a file in the repo) and install it with `target` still `dm`. `scripts/acceptGroup.ts`: without `--joe-has-announced` it prints what it would do and exits 1 having made no API call. With the flag it runs `checkCatalog` (refusing on any problem), accepts the invite, adds the group to the allow list, sets `target: "group"` and `launchThemeUntil` (+7 days), clears `lastHeartbeatAt`. Do not run it with the flag.
  Acceptance: `prd.md > Hard rules` — no group messages before Joe's announcement.
  Verify: `launchctl list | grep homer` shows a PID; after `kill <pid>` a new PID appears within a minute. `pnpm tsx scripts/acceptGroup.ts` prints the plan and exits 1. The allow list is DM-only and `state.json` has no launch record (`groupLaunchedAt` is null). (Reworded 2026-11-14: Joe accepted the group invite himself in the app, so `pnpm peek` shows `accepted`; the build never called `acceptConvo`.)

### 🛑 STOP 3 — soak in the DM, then launch

- [ ] **28. A day in the DM — Joe has seen every behavior work from his phone**
  Agent: main session, with Joe
  Spec ref: `spec.md > Testing and dry runs` (step 3), `spec.md > Open issues` (cursor after a long gap)
  Build: Homer runs under launchd against the DM for a day at the real schedule. Joe tries, from the app: `off` then `on`; an @ (answered as a reply); two @s sent while the process is stopped (both answered on start, oldest first, once each); closing the laptop for an hour (he carries on, no made-up ticks). The main session fixes what breaks.
  Acceptance: `prd.md > Operator controls` (off switch works from the phone), `prd.md > @-reply > Catch-up`, `prd.md > Morning gm`.
  Verify: Joe confirms each of the four. `ls logs/` for the day shows at most four heartbeats and one gm.

- [ ] **29. Launch — Homer is in the group and the room knows**
  Agent: Joe, with the main session watching
  Spec ref: `spec.md > Launch announcements`, `spec.md > Testing and dry runs` (step 4), `/build > The real group`
  Build: Blocked until the full catalog is in `memes/catalog.yaml`, every meme is posted, and `checkCatalog` exits 0. Joe announces Homer in the group himself. Joe then runs `pnpm tsx scripts/acceptGroup.ts --joe-has-announced`. First day: read `pnpm last` after each tick; check the first heartbeat fired at once, a reaction landed, the launch theme showed up, no meme repeated; have someone @ him and run `dumpMessages.ts` once on the group to confirm group mentions carry the facet.
  Acceptance: `prd.md > Launch announcements > Working when`; `prd.md > Heartbeat > Working when`.
  Verify: the group shows status `accepted` in `pnpm peek`; the first heartbeat log has outcome `posted` or `skipped`; `off` from Joe's phone still pauses him.

- [x] **30. @-replies on in the group**
  Agent: Joe
  Spec ref: `spec.md > @-reply` ("ships after the heartbeat is running in the group")
  Build: When the heartbeat has settled, add the group ID to `config.atReplyConvoIds` and restart the launchd job.
  Acceptance: `prd.md > @-reply > Working when`.
  Verify: an @ in the group gets one quote-reply within about 90 seconds; `pnpm last` shows trigger `at-reply`.
