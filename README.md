# Homer

An LLM character who lives in a Bluesky group chat. He drops memes, reacts, answers when he's @-mentioned, says gm in the morning, and greets newcomers with a line of dactylic hexameter.

Built with TypeScript and `@atproto/api`. The model is any OpenAI-compatible chat endpoint that supports tool calls.

## How it works

- **Runs.** A poll loop wakes Homer up for a few kinds of run: a heartbeat every couple of hours, a morning gm, an @-reply when someone mentions him, and a welcome when someone joins.
- **One plan per run.** In each run he reads the recent chat and may do a few lookups: search the chat, search Bluesky, read someone's posts, or read a link. Then he submits one `post` plan.
- **Checked in code.** Each plan is checked against rules written in code (caps, pacing, no repeats) before anything is sent.
- **One sending file.** Only `src/bluesky/send.ts` writes to Bluesky, and it refuses any conversation that isn't on the allow list in `src/config.ts`.
- **Prompts.** His voice and instructions are plain Markdown in `prompts/`.

## Setup

You need:

- Node 25+ and `pnpm`.
- A Bluesky account for the bot, with an app password that has DM access.
- An API key for an OpenAI-compatible model gateway.

```sh
pnpm install
cp .env.example .env   # fill in the bot's handle, app password and model key
```

Then edit `src/config.ts`:

- Set the conversation IDs (the test DM and the group) to your own. A conversation's ID is in its bsky.app URL.
- Set `model` to your gateway and model.
- Set `schedule.timeZone` to your time zone.

Start with only a DM between you and the bot on the allow list.

Memes are optional. They come from `memes/catalog.yaml`, which is not included; `src/memes/catalog.fixture.yaml` shows the format.

## Run

```sh
pnpm test         # unit tests
pnpm tick --dry   # one heartbeat run that plans but sends nothing
pnpm last         # show what the last run did
pnpm start        # the real loop
```

`launchd/` has a macOS LaunchAgent for keeping it running. Its README explains how to set it up.

## Docs

`docs/prd.md` covers what Homer does and doesn't do, and `docs/spec.md` covers how it's built. The other files in `docs/` are build notes.

## Be kind to your chat

Homer reads a group's messages and sends them to a model provider. Tell the group before adding him, and let people opt out.
