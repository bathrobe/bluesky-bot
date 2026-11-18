# Homer on Bluesky — technical spec

Source: `prd.md` plus the `/spec` interview (2026-11-14).
Reference code: Signal Homer, `~/Developer/archive/homer/src`.

Start fresh: a new TypeScript project in this repo. The Python v0 files,
`persona.md` and `cursor.txt` are deleted at the start of the build. Nothing is
forked from Signal Homer; a few small pieces are copied in and trimmed (listed
under Key decisions).

## Stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript on Node 25, run with `tsx`, packages with `pnpm` | Joe's call; lets us copy Signal Homer's helpers and prompts |
| Bluesky | [`@atproto/api`](https://www.npmjs.com/package/@atproto/api) 0.32.0 | Has the full group chat surface (checked in the installed types): `getLog`, `getMessages`, `sendMessage` with `replyTo` / `facets` / post embed, `addReaction`, `acceptConvo` |
| Model | [inference.coop](https://docs.inference.coop/) gateway, model `tinfoil/deepseek-v4-1-flash` ($0.65 / $1.45 per 1M) | Runs in an encrypted enclave; co-op stores usage counts only; [tool calling listed](https://docs.inference.coop/models/); covered by Joe's $15 monthly member credit |
| Model API | OpenAI-style `POST /chat/completions` at `https://gateway.inference.coop/v1` ([docs](https://docs.inference.coop/api-access/)), called with `fetch` | No SDK needed; base URL and model are config values, so a provider swap is one line |
| Validation | `zod` | Checks the model's tool arguments and the final plan |
| Catalog format | `yaml` package | 150 hand-edited entries read better in YAML than JSON |
| Tests | `vitest` | Same as Signal Homer |
| Database | none | The chat is the source of truth; see Data and state |
| Web search | none | Bluesky search only, for now |

No fallback provider. If inference.coop breaks, the fallback to try is
OpenRouter restricted to ZDR endpoints (same request shape).

API references: [getLog](https://docs.bsky.app/docs/api/chat-bsky-convo-get-log),
[OpenAI-style tool calling](https://openrouter.ai/docs/features/tool-calling).

## Runtime

- **Host:** Joe's Mac, run natively. No Docker.
- **Process:** one long-running Node process, `pnpm start` → `tsx src/main.ts`.
- **During the build:** started by hand in a terminal.
- **Before group launch:** `launchd/homer.plist` starts it at login and restarts it on a crash.
- **Env vars** (`.env`): `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` (must have DM access), `INFERENCE_API_KEY`.
- **Sleep:** on wake the next poll carries on from the saved cursor. Missed heartbeats and gms are dropped. Missed @s are answered.
- **Network loss / API errors:** a failed poll logs, waits (30s, doubling to 5 min), and retries. It never exits the process. A 429 uses the same backoff.
- **Session expiry:** `session.ts` logs in again on an auth error and retries the call once.
- **Model call asleep mid-request:** if a call's wall-clock time far exceeds its timeout, the Mac slept; the call is discarded and retried.

## Architecture overview

```
                    ┌────────────── main.ts ──────────────┐
                    │  every 30s            every 60s      │
                    ▼                       ▼              │
 Bluesky chat ──> Listener              Scheduler          │
  (getLog)        │  drops other convos   │ heartbeat due? │
                  ├─> Off switch          │ gm due?        │
                  └─> Mention check       │                │
                          │               │                │
                          ▼               ▼                │
                        Run queue (one run at a time)      │
                          │                                │
                          ▼                                │
   Bluesky chat <── Run pipeline ──> inference.coop        │
   (getMessages)    context → tool loop → plan             │
                          │   lookups: search_chat,        │
                          │            search_bluesky      │
                          ▼                                │
                    Plan check ── invalid ──> back to model│
                          │ valid                          │
                          ▼                                │
                    Sender (allow list, off switch)        │
                          │                                │
              Bluesky chat (sendMessage, addReaction)      │
                          ▼                                │
                 state.json + logs/<run>.json ─────────────┘
```

## Listener

Implements: the base for `prd.md > @-reply`, `prd.md > Operator controls`,
`prd.md > Hard rules` (only allowed conversations).

- `bluesky/poll.ts` calls `chat.bsky.convo.getLog({cursor})` every 30 seconds.
- Events from a conversation not on the allow list are dropped before anything else looks at them.
- Only `logCreateMessage` events are acted on. Each goes to the off switch check, then the mention check.
- The new cursor is saved to `state.json` after the batch's triggers are queued.
- First run with no cursor: `getLog` with no cursor returns "now"; start there.

## Off switch

Implements: `prd.md > Operator controls`.

- `triggers/offSwitch.ts`: a message in the test DM, from Joe's DID, whose whole text is `off` or `on` (any case) flips `paused` in `state.json`. Homer confirms with one line in the DM.
- `paused` is checked in three places: before a run is taken from the queue, before the model call, and inside every send function.
- While paused: polling continues, @s stay queued, heartbeats and gms are not run and are not made up later.
- Delay: up to one poll (30s).
- **Operator alerts:** `send.ts` has `sendOperatorAlert(text)`, which can only target the test DM. Used when a run gives up after three failures. At most one alert per day.

## Scheduler

Implements: triggers for `prd.md > Heartbeat` and `prd.md > Morning gm`.

- `triggers/schedule.ts`, checked every minute. All time math in `America/New_York` via `Intl` (ported from Signal Homer's `runner/time.ts`, which handles DST).
- **Heartbeat due** when all are true: time is 6:30am–midnight ET; 5 hours since `lastHeartbeatAt`; at least 1 hour since the last gm; not paused.
- **Gm due** when all are true: today's gm minute (random, 7:00–9:00 ET, picked once per day) has passed; it is before 10:00 ET; no gm today; at least 1 hour since the last heartbeat; not paused.
- `lastHeartbeatAt` is written only when a heartbeat run finishes (a post or a deliberate skip). A failed run leaves it unset, so it retries next minute.
- After three failed attempts in one window: mark the tick done, alert Joe in the DM, wait for the next window.
- Missed ticks are never made up.

## Run queue

Implements: `prd.md > When behaviors collide`.

- `runs/runQueue.ts`: one run at a time, never overlapping.
- Order when several are waiting: heartbeat, then gm, then @s oldest first.
- An @ that arrives during a heartbeat is answered as soon as it finishes, with no added delay. The heartbeat's posts are in its transcript.
- At least 60 seconds between two @-reply runs.

## Run pipeline

Implements: the shared path for every behavior.

`runs/runShared.ts`, used by heartbeat, @-reply and gm:

1. **Context.** Fetch recent messages for the target conversation (`history.ts`): the last 100, none older than 7 days. Build the transcript (`transcript.ts`): one line per message with a short handle, time, text, reply arrow, reactions folded onto their target, and the message ID in braces.
2. **Prompt.** System = `prompts/SYSTEM.md` + the run's skill file. First user message = transcript + meme catalog with spent memes marked + run-specific notes.
3. **Tool loop** (`llm/toolLoop.ts`). The model may call lookup tools, then must call `post`. Step cap: 8 model turns. If it answers in plain text with no tool call, it is re-prompted once, then the run fails.
4. **Plan check** (`plan/validatePlan.ts`). On failure the error text goes back to the model as the tool result; nothing has been sent. Two failed plans in a row end the run as failed.
5. **Execute** (`plan/executePlan.ts`). Sends each action in order through the Sender, or prints them in dry mode. The run ends here; there is no second round.
6. **Record.** Update `state.json`, write the run log.

`llm/client.ts`: one `fetch` to `/chat/completions` with `tools` and
`parallel_tool_calls: false`. Timeout 120s, two attempts, retry only on
transport errors and 408/429/5xx. An empty reply or `finish_reason` of `length`
or `content_filter` counts as an error.

### Lookup tools

Read-only. Nothing leaves the process except the search query and, for `bluesky_user_posts`, the handle. `read_link` (`tools/readLink.ts`, `tools/linkPreview.ts`) returns the site, title and description of a link in a transcript message; the model passes a message id, never a URL, so the only thing that leaves is a GET to a link a member posted.

- **`search_chat({keywords, before?})`** — Implements: `prd.md > Callback`.
  Pages back through `getMessages` (100 per request, up to 30 pages per call) and returns messages containing any keyword: ID, sender, date, text. Returns "no matches" plainly when empty. History begins when Homer joined the group; older messages are not available on the platform.
- **`search_bluesky({query})`** — Implements: `prd.md > Outside finds`.
  `app.bsky.feed.searchPosts` through Homer's session. Returns up to 10 posts: author handle, text, link. No write calls.
- **`bluesky_user_posts({handle, query?, portrait?})`** — one account's public posts.
  `getProfile`, then `getAuthorFeed` (latest 10, no replies or reposts) or `searchPosts` with `author` when `query` is given. `portrait: true` (for a dactyl request) pages up to 3×100 of their own posts and returns the 10 most-engaged (likes + reposts + replies + quotes) and the latest 10, in one lookup (`tools/authorFeed.ts`). `handle` is a full handle or a member's short name. A chat member is refused unless they sent a message in the run's transcript or their handle is typed in it; non-members are always allowed. No write calls.
- Shared cap: 4 lookup calls per run.

### The `post` tool

Implements: `prd.md > Emoji reaction`, `prd.md > Meme drop`, and the sending half of every behavior.

```
post({
  reason: string,            // one line, for the log
  actions: [                 // empty list = skip
    { type: "react", messageId, emoji },
    { type: "text",  text, replyTo?: messageId },
    { type: "meme",  file, caption?, replyTo?: messageId,
                     onTheNose?: { why: string } },
  ]
})
```

### Plan check

Implements: `prd.md > Hard rules`, enforced in code.

| Rule | Check |
|---|---|
| Send cap | At most 5 `text` + `meme` actions and 3 `react` actions per run. Gm: exactly one `text` or none. |
| Real messages only | Every `messageId` and `replyTo` must be an ID that appeared in this run's transcript or a `search_chat` result. |
| No repeat reactions | Rejected if Homer already has that emoji on that message. |
| Meme exists | `file` must be a catalog entry with a `post` link. Error: "not in the catalog". |
| Meme cooldown | See Meme catalog and usage. |
| Text hygiene | `cleanText.ts` strips control tokens and literal `\n`; empty text after cleaning is rejected. |
| @-reply shape | In an @-reply run, the first `text` or `meme` action must have `replyTo` set to the mentioning message. |

## Sender

Implements: `prd.md > Hard rules` (only allowed conversations; nothing public; no group messages before the announcement).

- `bluesky/send.ts` holds the only three functions that write to Bluesky: `sendText`, `sendMemeEmbed`, `addReaction`. Plus `sendOperatorAlert`, fixed to the test DM.
- Each one throws if the conversation ID is not in `config.allowedConvoIds`, and returns without sending if `paused`.
- The group's ID is absent from the allow list until `scripts/acceptGroup.ts` is run after Joe's announcement.
- A meme is sent as `embed: app.bsky.embed.record` pointing at the meme's public post (URI and CID from the catalog), so the image previews in chat.
- Nothing in `src/` creates posts, likes, follows, or public replies. Memes are posted to the profile only when Joe runs `scripts/postMemes.ts` (`pnpm post-memes`), which chains them into one thread and writes each link into the catalog. Homer's process never imports it.
- A `text` send gets a link facet for every URL (so links are clickable), and its first bsky.app post link is resolved and sent as the message's embed, with that URL removed from the text (`bluesky/textMessage.ts`). The plan check allows one post link per message, and one text or meme per @-reply run. A meme caption works the same way, except the cited post is sent first as its own card message (`bluesky/memeMessage.ts`), since the meme takes the embed. In heartbeat and gm runs the plan check also rejects a reply to a message Homer already replied to (`plan/repeatReplyRule.ts`); the heartbeat notes list what he answered since the last tick. Welcome (`runs/welcome.ts`, `src/welcome/`, `prompts/welcome.md`): the poll passes on `logAddMember` / `logMemberJoin` events from the target conversation; two minutes later the run queue takes a `welcome` run, which finds joins in the last 24 hours not in `state.welcomedDids` (nobody: no model call), reads each newcomer's public display name and bio (`getProfiles`, never their posts), and sends two lines of hexameter naming each with an epithet. The `post` plan carries `epithets` (welcome run only, one per newcomer); they are kept in `state.epithetsByDid` and listed in heartbeat and @-reply notes for members in view. Everyone found is marked welcomed after a finished run. `scripts/welcome.ts <did>` dry-runs it. Member names come from `getConvoMembers` (paged): `getConvo` lists only a few members of a group. The tengri playlist (`src/playlist/`): a `playlist_add` action names a transcript message holding a YouTube video; the plan check requires a video that is not already on the list, and running it writes the song to `state.json` (`playlist`) and sends nothing to Bluesky. A `{playlist}` token in a text or caption is sent as the words "tengri playlist" with a link facet to YouTube's no-account `watch_videos?video_ids=…` link (50 videos at most, a new link whenever the list changes). Heartbeat and @-reply run notes carry the playlist's size, newest titles and the transcript's YouTube links not yet on it. `scripts/playlist.ts` lists, seeds from chat history, and removes. Heartbeat pacing is also checked in code (`plan/heartbeatPaceRules.ts`): with fewer than `caps.heartbeatMinOtherMessages` messages from other people since Homer last spoke, a heartbeat may only react (a reply to a message that says his name still passes), and a heartbeat message may not open with "gm", which belongs to the gm run. The heartbeat notes also state his recent habits as facts (`runs/heartbeatHabitNotes.ts`): messages from others since he spoke, the mix of his last 8 messages, and words he used in 3 or more of them.
- A send that errors is not retried inside the run. The failure is logged and the remaining actions are dropped.

## Meme catalog and usage

Implements: `prd.md > The meme catalog`, `prd.md > Meme drop` (cooldown).

**Launch blocker, and Joe's own manual project.** Steps 1–3 are done by Joe by
hand, outside `/build`. The build only provides the file format, the loader,
and `checkCatalog.ts`, and can be tested in the DM with a handful of entries.

1. Prune `~/Pictures/Memes` (about 160 files, 148 catalog rows today) and rewrite each "good for" line.
2. Save the result as `memes/catalog.yaml` in this repo.
3. Joe posts every kept meme to Homer's public profile by hand, before launch.
4. Add each post's link to its catalog entry. `scripts/checkCatalog.ts` resolves every link to a URI and CID and reports entries that are missing a file or a live post.

**Entry shape:**

```yaml
- file: introvert-with-ai-train.jpeg
  description: Boss/Leader/Introvert comparison, introvert with AI has a whole train
  goodFor: someone does something hacky or overpowered with AI
  post: https://bsky.app/profile/winedark.ink/post/3k...
```

**In the prompt.** The whole catalog goes into every heartbeat and @-reply
(about 8–10k tokens today). Each entry is tagged `fresh` or `spent`. If the
pruned catalog grows well past this size, switch to a lookup tool.

**Cooldown rule** (`memes/usage.ts`), per conversation:

- A meme is `spent` if it has been used in this conversation and at least one never-used meme remains.
- When every meme has been used, the least recently used quarter of the catalog becomes `fresh` again.
- **On-the-nose override:** a `spent` meme is accepted when the action carries `onTheNose.why`, the meme was last used more than 30 days ago, and no override has been used in the last 7 days. The reason is logged.
- Usage in the test DM does not spend a meme for the group.

## Heartbeat

Implements: `prd.md > Heartbeat`.

- `runs/heartbeat.ts` builds the run-specific notes:
  - time of day and how long since anyone spoke;
  - how many of the last 20 messages are Homer's;
  - messages since the last tick that say "homer" (word match) without a mention facet, flagged as "someone said your name";
  - "nobody has spoken since your last post" when true;
  - the launch brief, while the launch theme is on.
- Skill file: `prompts/heartbeat.md`, adapted from Signal Homer's `skills/heartbeat.md` (reaction on nearly every tick; one substantive move; artifact over commentary; skipping the substantive move is allowed).
- Caps: 5 messages, 3 reactions.

## @-reply

Implements: `prd.md > @-reply`. Ships after the heartbeat is running in the group.

- **Trigger** (`triggers/mentions.ts`): a new message in an allowed conversation with a facet feature `app.bsky.richtext.facet#mention` whose `did` is Homer's. Homer's own messages never trigger.
- **Already answered:** before the run, code looks for a Homer message whose `replyTo` is the mention, and for the mention's ID in `skippedMentionIds`. Either one drops it.
- **Catch-up:** on wake, the saved cursor returns every missed event, however old. Each unanswered @ is queued oldest first. The run notes give the @'s age; the model may skip a stale one on purpose, which records it as skipped.
- **Budget:** per conversation, 4 answered @s in any 15 minutes. The next one gets a brush-off (noted in the run so the model keeps it to a line). After that, @s inside the window are recorded as skipped without a model call. The budget applies to catch-up too (Joe's call, 2026-11-14): of many missed @s, four are answered, one gets a brush-off, and the rest inside the window are skipped.
- Skill file: `prompts/at-reply.md`, from Signal Homer's `skills/at-reply.md`.
- **Check before every run** (`runs/atReplyCheck.ts`): history is fetched fresh from now back to the @ (not only the last 100), so the already-answered check holds however old the @ is. A deleted @ is dropped. The @ is always shown in the run notes, and its ID is a known ID even when it is older than the transcript.
- **After the run:** a reply to the @ that landed records an answered time. An empty plan, or reactions only, records the ID in `skippedMentionIds` (a reaction has no `replyTo`, so nothing else would mark it done).
- **Failed run** (`runs/atReplyRetry.ts`): queued again after 2 minutes, then 10. A third failure alerts Joe and gives up until the next start; the ID is not marked skipped.
- **Start scan** (`triggers/mentionsCatchUp.ts`): the queue is in memory and the cursor is saved once an @ is queued, so each start also queues every unanswered @ in the recent history (last 100 messages, 7 days) of the @-reply conversations.

## Morning gm

Implements: `prd.md > Morning gm`.

- `runs/morningGm.ts`. Same pipeline; the plan check allows one `text` action or an empty list.
- Skill file: `prompts/morning-gm.md` (one short lowercase line; skip if the room is tense or mid-serious-conversation).
- A missed morning is not made up.

## Launch announcements

Implements: `prd.md > Launch announcements`.

- `config.launchThemeUntil` is a date. While it is in the future, `prompts/launch.md` is added to the heartbeat notes.
- `launch.md` holds the facts he must get right, in plain statements: he is a bot; he reads the whole chat from the day he joined; what he can do; when he runs; that chat text is sent to `tinfoil/deepseek-v4-1-flash` in an encrypted enclave through inference.coop; that anyone who finds this weird is free to leave.
- Default length: seven days from launch. Joe ends or extends it by editing the date.
- `scripts/acceptGroup.ts` (run by Joe after his own announcement): accepts the group invite, adds the group ID to the allow list, sets `target: "group"`, sets `launchThemeUntil`, and clears `lastHeartbeatAt` so the first heartbeat fires right away.

## Prompts

Implements: `prd.md > Persona`.

- `prompts/SYSTEM.md` starts from Signal Homer's final `skills/SYSTEM.md`, with the PRD's remove list applied (Wine Dark, worldview, people notes, Twitter, image generation, deletion note, Signal wording) and the tool section rewritten for look-then-`post`.
- It states that he cannot remember why he reacted or posted in the past, and should say so if asked.
- `prompt.ts` joins `SYSTEM.md` + `---` + the skill file. No template variables.

## Run log

Implements: `prd.md > Operator controls` (seeing what he saw and why).

- `log.ts` writes `logs/<ISO time>-<trigger>.json`, one file per run, pretty-printed.
- Contents: trigger, conversation, model, the exact first user message, each model turn (tool calls, arguments, results), each rejected plan with its error, the final plan and `reason`, what was sent with message IDs, token counts, duration, outcome (`posted`, `skipped`, `failed`, `dry`).
- `pnpm last` prints the newest. Joe points an agent at `logs/` for summaries or a throwaway web view.
- Logs contain chat text. They are in `.gitignore` and stay on the Mac.

## Data and state

| Data | Lives in | Written by | If lost |
|---|---|---|---|
| Chat messages, reactions | Bluesky only | members, Homer | n/a |
| Poll cursor | `state.json` | Listener | start from now; scan the last 100 messages for unanswered @s |
| `lastHeartbeatAt`, `lastGmDate`, `gmMinuteToday` | `state.json` | Run pipeline | heartbeat time is taken from his newest message; gm may repeat once |
| `paused` | `state.json` | Off switch | rebuilt from Joe's last `off`/`on` in the DM |
| `skippedMentionIds`, @ budget timestamps | `state.json` | @-reply | a skipped @ may be answered late |
| `memeLastUsed`, per conversation | `state.json` | Plan executor | `scripts/rebuildMemeUsage.ts` scans his own embeds in the chat |
| `lastOverrideAt`, `lastAlertDate`, failure count | `state.json` | Plan executor, Scheduler | resets; harmless |
| Meme catalog, prompts, config | repo | Joe | git |
| Run logs | `logs/*.json` | every run | harmless |
| Secrets | `.env` | Joe | re-enter |

`state.ts` writes to a temp file and renames it, so a crash cannot leave a
half-written file.

## Message lifecycle

```
member sends "@homer what was that horse thing"
  │  ≤30s
Listener: getLog(cursor) → logCreateMessage
  ├─ conversation not on the allow list → dropped
  ├─ from Joe, in the DM, text is off/on → flip paused, confirm, stop
  └─ mention facet holds Homer's DID → add to the @ queue; save cursor
Run queue (one at a time; heartbeat, gm, then @s)
  ├─ paused → stays queued
  ├─ Homer already replied to it, or it is in skippedMentionIds → drop
  └─ over the @ budget → brush-off run, or record as skipped
Run pipeline
  1. getMessages → transcript (IDs in braces)
  2. prompt = SYSTEM.md + at-reply.md; notes = the @, its age, catalog
  3. model: search_chat(["horse"]) → 3 matches with IDs
  4. model: post({reason, actions: [{type:"text", replyTo:<@ id>, text}]})
  5. plan check: cap, IDs real, reply shape, text cleaned
       ├─ fails → error back to the model, nothing sent
       └─ passes
  6. Sender: allow list ✓, paused ✗ → sendMessage({convoId, message:{text, replyTo}})
  7. state.json updated; logs/2026-…-at-reply.json written
```

## File structure

Every file under 100 lines. Functions, not classes.

```
src/
  main.ts                 start up: log in, poll every 30s, check schedule every minute
  config.ts               conversation IDs, allow list, target (dm | group), schedule,
                          caps, model + base URL, launchThemeUntil, Joe's DID
  state.ts                read and write state.json safely
  log.ts                  write logs/<time>-<trigger>.json
  bluesky/
    session.ts            log in, chat-proxied client, log in again on expiry
    poll.ts               getLog from the cursor → list of events
    history.ts            recent messages; page back through older ones
    send.ts               the only code that sends; allow list and paused checks
  triggers/
    schedule.ts           heartbeat due? gm due? (ET window, DST-safe)
    mentions.ts           mention-facet check, already-answered check, @ budget
    offSwitch.ts          off / on from Joe in the DM
  runs/
    runQueue.ts           one run at a time; ordering
    runShared.ts          context → loop → plan check → send → record
    heartbeat.ts          heartbeat notes
    atReply.ts            @-reply notes
    morningGm.ts          gm notes
  llm/
    client.ts             one chat-completion call: timeout, retry, sleep detection
    toolLoop.ts           lookups until `post`, or the step cap
  tools/
    searchChat.ts         keyword search back through history
    searchBluesky.ts      read-only public post search
    post.ts               zod schema for the plan
  plan/
    validatePlan.ts       every rule in the Plan check table
    executePlan.ts        send each action, or print it in dry mode
  memes/
    catalog.ts            load catalog.yaml; tag entries fresh / spent
    usage.ts              cooldown rule and the on-the-nose override
  transcript.ts           messages + reactions → the text the model reads
  prompt.ts               SYSTEM.md + skill file
  cleanText.ts            strip control tokens and stray "\n"
prompts/
  SYSTEM.md  heartbeat.md  at-reply.md  morning-gm.md  launch.md
memes/
  catalog.yaml
scripts/
  peek.ts                 read-only: list conversations and statuses
  tick.ts                 run one heartbeat now (--dry prints the plan)
  gm.ts                   run one gm now (--dry)
  last.ts                 print the newest run log
  acceptGroup.ts          one-off launch step, after the announcement
  rebuildMemeUsage.ts     rebuild meme usage from his own embeds
  checkCatalog.ts         every entry has a file and a live post
launchd/
  homer.plist             start at login, restart on crash
state.json  logs/  .env   not in git
```

## Testing and dry runs

Nothing touches the group until launch day: its ID is not in the allow list.

1. **Unit tests** (`vitest`), no network: `validatePlan`, `memes/usage`, `triggers/schedule`, `triggers/mentions`, `transcript`, `cleanText`. These cover every hard rule.
2. **Dry runs.** `pnpm tick --dry` and `pnpm gm --dry` read the real DM, call the real model, and print the plan without sending. The log is written with outcome `dry`.
3. **The test DM** (Homer and @joetforhire.com, conversation `3myzmduu7x32v`). With `target: "dm"`, the full process runs against the DM: heartbeats on a short test interval, @s by mentioning him, `off` / `on`, meme embeds, reactions, callbacks against DM history.
4. **Launch.** Joe announces, then runs `scripts/acceptGroup.ts`.

No test or probe message is ever sent to the group.

## Key decisions

| Decision | Why | Trade-off accepted |
|---|---|---|
| TypeScript, started fresh | Joe prefers it; Signal Homer's helpers and prompts copy over | The working Python v0 is thrown away |
| No database; chat is the source of truth | No permanent local copy of the chat; nothing to drift; deleted messages vanish for Homer too | `search_chat` pages the API and slows as history grows (capped at 30 pages per call) |
| Callback history starts when Homer joins | The platform gives a member no access to earlier messages | Changes `prd.md > Callback` |
| Look first, then one `post` | Signal Homer's mid-loop sends caused duplicate sends and retry loops | He cannot post, look something up, and post again in one run |
| Hard caps: 5 messages, 3 reactions | Joe wants room for him to choose | A bad run can post five messages |
| New small tool loop, not the 880-line port | The new design needs far less | Loses Signal Homer's battle-tested edge handling; its lessons are kept as rules |
| inference.coop enclave model, no fallback | Stronger than ZDR; uses Joe's membership | One provider; an outage means silence and a DM to Joe |
| Catalog in the prompt | He matches memes without deciding to go look | About 10k tokens per run |
| Meme usage cached in `state.json` | Deriving it needs a full history scan each run | A second copy of something the chat knows; rebuild script covers loss |
| Off switch by DM | Works from Joe's phone with no extra app | Up to 30s delay; needs the process running to confirm |
| Web search dropped | Bluesky search is enough for now | Changes `prd.md > Outside finds` |

Copied from Signal Homer and trimmed: `runner/time.ts` (schedule math),
`transcript.ts` (format), `stripControlTokens` from `safety/proxy.ts`,
`runner/prompt.ts`, and the four skill files.

Cost: about six runs a day at roughly 15k tokens in and 1k out comes to about
$0.07 a day, $2–3 a month.

## Open issues

Each needs a check in the test DM before the code depends on it.

- **Tool calling through the gateway.** Confirmed (`spike-notes.md > Tool calling`). Still unknown: whether it is the October edition, and the gateway's rate limits.
- **Mentions in chat.** Confirmed in the test DM: the app writes a mention facet holding Homer's DID (`spike-notes.md > Item 4 findings`). Not yet seen in a group; checked at launch.
- **Meme embed preview.** Confirmed in the test DM: a post embed renders the image, and empty text is accepted (`spike-notes.md > Item 4 findings`).
- **Chat rate limits.** Nothing published. 30-second polling and 30-page searches are guesses.
- **Cursor after a long gap.** Confirm `getLog` returns a week of events from an old cursor.
- **When "joined" starts.** Joe accepted the group invite in the app on 2026-11-14, before launch; Homer still cannot read or send there until `acceptGroup.ts` writes the launch record. Still unknown whether his history begins when he was added or when the invite was accepted.
- **`search_chat` quality.** Plain keyword match. Signal Homer added an LLM rerank; add it only if callbacks are bad.
- **On-the-nose limits** (30 days, once a week) are a default Joe has not confirmed.
