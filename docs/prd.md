# Homer on Bluesky — requirements

Source: `design-interview.md` (2026-11-01) plus the `/prd` interview (2026-11-14).
Reference for anything "as in Signal Homer": `~/Developer/archive/homer/skills/`.

## Purpose

Homer is a funny, weird character who keeps a quiet group chat alive. He does
what members can't do as easily: drop the right meme, react, dig up an old
message, bring in something from outside. He is not another person making
conversation.

## The room

"🐎🏹SHRINE OF TENGRI, GOD OF BLUE SKY🐎🏹" — 20 members, not very active, about
half knew Signal Homer.

- **Active members:** get memes and callbacks that match what they are talking about, and answers when they @ him.
- **Silent members:** see a few Homer posts a day. Nothing is asked of them.
- **Members who don't want him:** told clearly that he is there and what he reads. Opting out means leaving the chat.
- **Joe:** operator. Announces Homer himself, posts the meme gallery by hand, can turn Homer off at any time.

Everything is tried first in the test DM between Homer and @joetforhire.com.

## Behaviors

### Heartbeat

- **Trigger:** every 5 hours, 6:30am to midnight ET (four ticks a day). Only while Joe's laptop is on.
- **Does:** follows Signal Homer's heartbeat format (`skills/heartbeat.md`): glance at the room, pick one move, do it. Artifact over commentary, at least 80% special actions.
  - An emoji reaction on a recent message happens on nearly every tick.
  - On top of the reaction, one substantive move: meme drop, callback, web or Bluesky find, or (rarely) plain commentary.
  - May skip the substantive move if nothing fits.
- **His name:** if someone has said "homer" without a real mention since the last tick, the heartbeat treats that as something to respond to.
- **Quiet room:** still runs. If nobody has spoken since his last post, the deadness is material: he can comment on it or react to it.
- **Working when:** judgment call, Joe and the room. Memes are funny, people respond to his posts, and the chat talks more because he is there.
- **Edge cases:** missed ticks (laptop off) are not made up; he rejoins the normal schedule.

### Meme drop

- **Trigger:** chosen inside a heartbeat or an @-reply.
- **Does:** picks a meme from the catalog that matches the room's current bit or answers a specific message, and sends the link to that meme's public post so the image previews in chat. A short caption is fine; the image is the move.
- **Cooldown:** a used meme is not used again until as much of the rest of the catalog as possible has been used. Exception: a perfectly on-the-nose match. Enforced in code, not left to the model.
- **Working when:** the meme fits what was just said, and no meme repeats while unused ones remain.
- **Edge cases:** only catalog entries with a known public post can be sent; he never invents one.

### Emoji reaction

- **Trigger:** nearly every heartbeat; optional in an @-reply.
- **Does:** reacts to a message with an emoji that says something, as in Signal Homer's persona ("reactions are a creative medium").
- **Working when:** the reaction reads as a tiny joke or take, not an acknowledgement stamp.

### Callback

- **Trigger:** the current thread rhymes with an older moment; or someone asks.
- **Does:** searches the chat history from the day he joined (the platform gives him nothing earlier), with no expiry, and quote-replies or references the old message with at most one line.
- **Working when:** the old message is real and the connection is obvious without explanation.
- **Edge cases:** if the search finds nothing he says so. He never reconstructs a message from memory.

### Outside finds

- **Trigger:** heartbeat or @-reply where something from outside would help.
- **Does:** Bluesky search, then posts one link with tiny framing. (Web search dropped for now; see `spec.md > Key decisions`.)
- **Working when:** the link is something the room wants and would not have found in the moment.

### @-reply

- **Trigger:** a real Bluesky mention of Homer, and nothing else. His name typed without a mention does not summon him; it is picked up at the next heartbeat (see Heartbeat).
- **Does:** answers as in Signal Homer's `skills/at-reply.md`: one or two sentences, or a tool-backed answer when one was asked for.
- **Catch-up:** when Homer comes back online he answers every @ he missed, however old. The @ budget still applies: past four answers and one brush-off in 15 minutes, the rest are skipped (`spec.md > @-reply`).
- **Working when:** every @ gets an answer or a deliberate skip, and none is answered twice.
- **Ships after** the heartbeat is running in the group.

### Morning gm

- **Trigger:** once each morning.
- **Does:** one short lowercase greeting, as in Signal Homer's `skills/morning-gm.md`. Skips if the room is tense or mid-serious-conversation.
- **Edge cases:** a missed morning is not made up later.

### Launch announcements

- **Trigger:** heartbeats during the first few days in the group. Joe makes the first announcement himself.
- **Does:** Homer announces himself as a running theme: what he is, what he can read (the whole chat, including old messages), what he can do, when he runs, which model he runs on and where chat text is sent, and that anyone who finds that weird is free to leave. Fun and casual, in his own voice. This replaces Signal Homer's `/info` command, which is not coming over.
- **Working when:** a member who reads only one day of the chat that week knows a bot is present and reading.

## The meme catalog

Launch is blocked on this. It is its own piece of work and needs its own pass.

1. **Prune and rewrite** the catalog from `~/Pictures/Memes` (about 160 files and `catalog.md`): decide what stays, sharpen each "good for" line.
2. **Keep the catalog in this repo** as the single source Homer reads.
3. **Joe posts each kept meme** to Homer's public profile before launch, by running a posting script himself, so post times reveal nothing about the chat. Homer never posts.
4. **Link each catalog entry to its post** so Homer can send it.

### How Signal Homer's meme pipeline worked

Read from `~/Developer/archive/homer/src` (`tools/reference.ts`,
`tools/actions.ts`, `db/queries.ts`, `runner/heartbeat.ts`). Bluesky Homer
should work the same way unless noted.

1. **Catalog is a markdown table.** One row per meme: filename, description, "good for". The image files sat in a read-only `/memes` folder.
2. **Homer never sees the images.** He picks blind from the catalog text, so the "good for" line does all the work.
3. **Discovery is one tool.** `read_reference("meme-catalog")` returns the whole catalog. There is no folder listing.
4. **Recent drops are shown to him.** Every heartbeat prompt includes "Memes you've dropped in the last 90 days. Don't repeat these." with filenames and captions.
5. **Sending is guarded in code.** `send_image` rejects a filename that does not exist ("don't guess, read the catalog") and rejects any meme sent in the last 90 days. The prompt is advisory; the guard is the rule.
6. **History comes from the run log.** There is no separate "used memes" table; past drops are found by scanning logged `send_image` calls.

**What changes on Bluesky:**

- "Send image" becomes "send the link to that meme's public post".
- The fixed 90-day cooldown becomes least-recently-used: prefer memes never used, then the ones used longest ago.
- The on-the-nose exception means the guard needs a deliberate override rather than a flat rejection.

## Persona

Start from Signal Homer's final `skills/SYSTEM.md`, not this repo's `persona.md`.

- **Remove:** everything about the Wine Dark collective (retired), the "project worldview" section and any other secondary-orality wording, people notes, Twitter, image generation and meme remix, the 90-day deletion note, Signal-specific wording.
- **Keep:** guardrails, voice, no glazing, no slop, no handler, reactions, meme discipline, anonymity by default, never send probe or test messages.

## When behaviors collide

Homer stays quiet rather than stacking posts. If a heartbeat and a reply are
due close together, the heartbeat goes first and the @ is answered later. No @
is ever dropped.

## Hard rules

Enforced in code.

- **Nothing from the chat goes public.** No text, names, topics, or paraphrases in public posts. The public profile is only a shelf of media to link into chat.
- **No public interaction.** No replies to strangers, follows, likes, or answering DMs from outside. (Strict for now; Joe is open to loosening.)
- **No group messages before Joe's announcement.** Members must know he is there before he reads or speaks.
- **Only allowed conversations.** Homer speaks in the target group and the test DM, nowhere else.
- **No meme reuse inside the cooldown.**
- **No test or probe messages** in the group, ever.

## Operator controls

- **Off switch:** Joe can turn Homer off easily at any time, including from his phone. (Mechanism is for `/spec`.)
- **Bad messages:** Joe deletes them by hand.
- **Laptop off means Homer off.** Accepted.

## v1 / later / never

- **v1, in order:** meme catalog and gallery → heartbeat in the group (reactions, memes, callbacks, finds, launch theme) → @-replies. Morning gm alongside the heartbeat.
- **Later:** generated images posted publicly then linked into chat (first backlog item; must not leak chat content), text-only memes, looser summoning than @, loosening public interaction.
- **Never:** daily digest, zine pipeline, knowledge vault, wallet, blog, Drive, Twitter posting, people notes.

## Open questions

- **Settled in /spec:** a queued @ is answered as soon as the heartbeat finishes (`spec.md > Run queue`).
- **Settled in /spec:** a real mention is a mention facet holding Homer's DID (`spec.md > @-reply`); to be confirmed in the test DM.
- **Can wait:** when the launch theme ends (a number of days, or Joe's call).
