# Process notes

## /prd (2026-11-14)

- **Decisions:** heartbeat and strict @ only; four ticks a day even in a dead chat; full chat history usable for callbacks; missed @s all answered on wake, missed ticks dropped; heartbeat ships before @-replies; everything tested in the DM first.
- **Added by Joe:** Bluesky search; generated images as first backlog item; launch-announcement theme in heartbeats; reaction on nearly every tick; meme catalog prune as a real piece of work; persona starts from Signal Homer's final SYSTEM.md minus Wine Dark.
- **Pushback:** none on scope. Operator controls felt abstract until framed as "bad post at 11pm"; answer was a simple off switch.
- **Resolved after the draft:** a collided @ is answered later, never dropped; only a real mention summons him; his name without a mention is heartbeat material; secondary-orality wording removed; no `/info` command, its content goes into the launch announcements.
- **Uncertain:** when the launch theme ends.
- **Deepening rounds:** one. Joe asked for all questions in one paragraph to answer by speech-to-text, overriding one-at-a-time. It produced the richest answer of the session.

## /spec (2026-11-14)

- **Decisions:** TypeScript, started fresh (v0 Python deleted at build); no database, chat is the source of truth with a small `state.json`; inference.coop enclave model `tinfoil/deepseek-v4-1-flash`, no fallback; look-then-`post` tool design; caps of 5 messages and 3 reactions per run; off switch by DM; plain JSON run logs; launchd added late.
- **Changed the PRD:** callbacks start at Homer's join (platform limit found in the lexicon); web search dropped; both "for /spec" questions settled.
- **Pushback from Joe:** questioned launchd (kept, but deferred); questioned the database (dropped; his idea was better); said not to copy Signal Homer's tool schema blindly (led to the single `post` tool); raised the send cap from 1 to 5; asked for the real catalog size to be checked before calling it small (148 rows, about 8-10k tokens).
- **Joe wants no teaching** on this build.
- **Uncertain:** on-the-nose override limits (Joe asked what it was; default written in, unconfirmed); everything under `spec.md > Open issues`, most of all whether mentions exist as facets in chat.
- **Deepening rounds:** one, five questions asked together at Joe's request.

## /checklist (2026-11-14)

- **Decisions:** autonomous build, one subagent per item, each item tagged Opus 5.5 or Fable 5.2, subagent ticks its own box. 30 items. Pauses only at three STOPs (spikes in the DM, hands-on DM play, DM soak + launch), replacing "every 3-4 items".
- **Order:** scaffold, then the three risky spikes, then the shortest path to a dry tick and a live tick in the DM, then memes, the long-running process, lookups, gm, launch brief, @-replies, launchd.
- **Changed from the spec/PRD:** @-reply code is built before launch but limited to the DM by `config.atReplyConvoIds`; turning it on in the group is a later config flip (item 30). Meme post links are resolved to URI + CID in memory at startup. Added `scripts/showTranscript.ts` and a `--note` flag on `tick` for DM testing. `acceptGroup.ts` refuses without `--joe-has-announced` and a clean `checkCatalog`.
- **Meme catalog:** off the checklist. Joe wants to co-create it in a web artifact, on its own track, after a format interview. Blocks item 29 only.
- **Joe's input:** no strong view on order; wanted early hands-on DM testing and to work on the catalog undisturbed. Said "proceed" before the going-live beat and the gut-check, so both were written from the PRD and spec without discussion.
- **Uncertain:** whether mention facets exist in chat (item 4 decides; items 24-25 depend on it); group mentions can only be confirmed after launch; `INFERENCE_API_KEY` is not yet in `.env`.

## Skill feedback

Joe declined to answer for now.

## Meme catalog track (2026-11-14)

- **Meme Wall:** https://claude.ai/artifact/6afGzwwQ7xVcNKvsvKXJDu (private). One row per meme in the artifact's database, collection `memes`, IDs `m001`–`m159`. Fields: `file`, `img`, `description`, `goodFor`, `status` (`undecided` / `kept` / `cut`), `post`, `notes`, `source`.
- **Format decided with Joe:** a scrolling wall, image beside editable text, keep/cut button, `goodFor` as the one real field, a free notes field for anything else, a post-link field and a "kept, not posted" filter. No post button (it would have needed code that posts; Joe will post another way).
- **Seeded from:** 141 old catalog rows, 3 remix-template rows, 13 new drafts (`memes/uncataloged-drafts.yaml`, for the files renamed today), 2 files with no text. Left out: an exact duplicate and a stray CSV.
- **To finish:** read the rows back and write `memes/catalog.yaml` from the kept ones.
- **Exported 2026-11-14:** Joe cut 41 on the wall and kept the other 118 (he did not click Keep; "not cut" means kept). `memes/catalog.yaml` written from those rows. No post links yet. Checklist item 14 updated to use this file instead of seeding its own. `memes/uncataloged-drafts.yaml` deleted; its text is in the catalog now.
- **Posting (2026-11-14):** Joe did not want to post and paste links by hand, and wants one thread to keep the profile tidy. Added `scripts/postMemes.ts` (`pnpm post-memes --next N`): Joe-run only, outside `src/`, posts stills as a self-reply chain, alt text = description, writes links to `catalog.yaml`, thread position in `memes/thread.json`. PRD and spec wording changed from "by hand" to "Joe runs the script; Homer never posts". First three posted for STOP 1.
