# Spike notes

Findings from real calls. Later items read this before building.

## Tool calling

Item 2, 2026-11-14. Script: `scripts/spikes/toolCall.ts` (run with `pnpm tsx --env-file=.env scripts/spikes/toolCall.ts`).

**Result: works.** Both turns returned one parseable `post` call. The look-then-`post` design is possible on `tinfoil/deepseek-v4-1-flash`.

- **Request shape that worked:** `POST https://gateway.inference.coop/v1/chat/completions`, `Authorization: Bearer <key>`, body `{ model, messages, tools: [post], tool_choice: "auto", parallel_tool_calls: false }`. Accepted with no errors.
- **Turn 2 (tool result back):** pushed the assistant message back *as received* (including `reasoning_content` and `provider_specific_fields`), then `{ role: "tool", tool_call_id, content: "Plan rejected: …" }`. The model called `post` again and fixed the plan (shortened text). The rejected-plan loop in `spec.md > Run pipeline` step 4 works.
- **Reported model:** `tinfoil/deepseek-v4-1-flash` (the alias only; whether it is the October edition is still unknown).
- **Gateway is LiteLLM.** Response headers are `x-litellm-*` (model id/group, call id, response cost broken into input/output/reasoning, key spend, duration). Useful for the run log.
- **Rate-limit headers: none.** No `x-ratelimit-*` or `retry-after` on a 200. Limits remain unknown; keep the 408/429/5xx retry.
- **Usage (turn 1 / turn 2):** prompt 454 / 708, completion 206 / 206 (reasoning 90 / 116), total 660 / 914. `prompt_tokens_details` has `cached_tokens` and `created_cache_tokens`; `completion_tokens_details.reasoning_tokens` is present.

### Tool-call shape quirks

- `finish_reason` is `"tool_calls"`. Exactly one entry in `tool_calls` (parallel off was respected).
- `function.arguments` is a **JSON string**, as in OpenAI. Must `JSON.parse` before zod. Key order is not stable.
- `message.content` is `""` (empty string, not `null`) on a tool-call turn. Don't treat empty content as "empty reply" when `tool_calls` is present.
- `message` keys: `role, tool_calls, reasoning_content, provider_specific_fields, content, refusal`. Reasoning text is in both `reasoning_content` and `provider_specific_fields.reasoning`. Worth logging; never send it to chat.
- **With `tool_choice: "auto"` the model may answer in plain text.** A bare "Say hi" with the `post` tool returned `finish_reason: "stop"` and text, no call (its reasoning: no reason to post). A system prompt saying "always reply by calling `post`" was enough in the spike.
- **`tool_choice: "required"` is accepted** and forced a `post` call on that same bare prompt. Option for `llm/toolLoop.ts`: use `"required"` on the re-prompt (or always, since every run must end in `post`), instead of failing after one plain-text reply.

## Chat shapes

Item 3, 2026-11-14. Scripts in `scripts/spikes/` (run with `pnpm tsx --env-file=.env …`): `sendEmbed.ts [--dry] <post url>`, `reactAndReply.ts`, `dumpMessages.ts`. All three take the conversation ID only from config and refuse anything but the test DM (`testDmGuard.ts`). All calls go through `chatAgent` (the `bsky_chat` proxy from `session.ts`).

### Sends that worked (real calls, test DM)

- **Reply:** `chat.bsky.convo.sendMessage({ convoId, message: { text: "<text>", replyTo: { messageId: "<id>" } } })`. No `$type` needed on `replyTo`. Response is the new `messageView`, with `replyTo` already expanded (see below).
- **Reaction:** `chat.bsky.convo.addReaction({ convoId, messageId: "<id>", value: "👍" })`. Response is `{ message: <messageView of the target> }` with the new reaction in `reactions`. **Reactions have no ID of their own**; one is identified by (message ID, value, sender DID). For a log, record the target message ID + value.
- **Reacting to Homer's own message is allowed.** (The newest DM message at spike time was Homer's; no error.)

### Embed send (resolved, not sent yet — item 4 sends it)

- Link `https://bsky.app/profile/<handle or did>/post/<rkey>` → `agent.resolveHandle({ handle })` → `at://<did>/app.bsky.feed.post/<rkey>` → `agent.getPosts({ uris: [uri] })` gives `uri` + `cid`. Read-only, logged-in agent (not the chat proxy).
- Planned message: `{ text: "", embed: { $type: "app.bsky.embed.record", record: { uri, cid } } }`. `$type` is required on `embed` (it's a union). **Unverified:** whether the chat service accepts empty `text` with an embed. If it rejects, try a short caption.

### Raw message JSON (`getMessages`, newest first)

- Each item: `{ $type: "chat.bsky.convo.defs#messageView", id, rev, text, sender: { did }, sentAt, reactions, replyTo?, facets?, embed? }`. Check `$type`: `#deletedMessageView` items can appear too.
- **`reactions` is always present**, `[]` when empty. Each: `{ $type: "chat.bsky.convo.defs#reactionView", value, sender: { did }, createdAt }`.
- **`replyTo` is a full nested `messageView`** of the parent (id, rev, text, sender, sentAt, reactions), not just a `{ messageId }` ref. The nested copy carries the parent's reactions. The transcript can show the quoted parent without a second lookup.
- **No facets and no embeds** on any of the 10 messages in the DM (all plain text). Mention facets are still unseen; item 4 tests them.
- Message IDs are TIDs (13 chars, e.g. `3n2b…`), sortable by time.

## Item 4 findings (with Joe, 2026-11-14)

Both confirmed in the test DM. These supersede the "unverified" and "still unseen" lines above.

- **Meme embed previews: confirmed.** `sendEmbed.ts` sent `{ text: "", embed: { $type: "app.bsky.embed.record", record: { uri, cid } } }` and Joe saw the image in the app. **Empty `text` with an embed is accepted**, so a caption is optional.
- **Embed as read back:** `embed: { $type: "app.bsky.embed.record#view", record: { $type: "app.bsky.embed.record#viewRecord", uri, cid, author, value, embeds: [{ $type: "app.bsky.embed.images#view", images: [{ thumb, fullsize, alt, aspectRatio }] }], indexedAt } }`. `rebuildMemeUsage.ts` can match Homer's own embeds by `embed.record.uri`. The post's `alt` text is available for the transcript.
- **Mentions carry a facet: confirmed (DM).** A message typed in the app as `@winedark.ink hello` came back with
  `facets: [{ $type: "app.bsky.richtext.facet", index: { byteStart: 0, byteEnd: 13 }, features: [{ $type: "app.bsky.richtext.facet#mention", did: "<Homer's DID>" }] }]`.
  The trigger in `spec.md > @-reply` works as written. Group mentions can only be checked after launch (item 29).
- **Seeded memes on Homer's profile** (for item 14's catalog):
  - `absolute-cinema-writing-is-fire.jpeg` → https://bsky.app/profile/winedark.ink/post/3n2c243wmu525
  - `all-quiet-on-the-frontal-lobe.jpeg` → https://bsky.app/profile/winedark.ink/post/3n2c244zhyz2l
  - `anime-about-to-deliver-hard-truth.jpg` → https://bsky.app/profile/winedark.ink/post/3n2c2463rpo2c

## getLog (item 17, 2026-11-14)

Real calls through `chatAgent`, metadata only printed.

- **No cursor:** `{ logs: [], cursor: "<now>" }`. Nothing is replayed; `poll.ts` saves that cursor and passes nothing on.
- **From a cursor:** events oldest first, then the next cursor. No `limit` param; pages hold up to 100, and a page of 98 still had more after it, so `poll.ts` pages until a page is empty (capped at 20 pages per poll). Calling with the current cursor returns `[]` and the same cursor.
- **Old cursor:** a very old cursor (`2222222222222`) returned history from the DM's `logBeginConvo` onward, so a long gap catches up (open issue "cursor after a long gap": works, from this probe).
- **Event shape:** `{ $type: "chat.bsky.convo.defs#logCreateMessage", convoId, rev, message: <messageView>, relatedProfiles }`. Also seen: `#logBeginConvo`, `#logAcceptConvo` (no `message`). Every conversation Homer is in shows up; most events in a page were from other conversations, dropped by `convoId` before anything else.
- **Homer's own sends** appear as `logCreateMessage` within one poll. Reactions are `#logAddReaction`, not passed on.
