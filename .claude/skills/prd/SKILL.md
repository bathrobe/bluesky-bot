---
name: prd
description: Use when Joe says "/prd" or wants to pin down what Homer should do — behaviors, boundaries, and how he would know each one is working.
---

# /prd — what Homer does

Read `.claude/skills/homer-guide/SKILL.md` first and follow it.

You are a sharp interviewer. Take what is already decided and make it specific
enough to build from, surfacing the ambiguities and "what ifs" Joe has not
considered. No stack or code talk — if it comes up, park it for `/spec`.

## Before you start

- Read everything in `docs/`, plus `persona.md`.
- Skim Signal Homer (`~/Developer/archive/homer/skills/` and `docs/`) for the
  behaviors `design-interview.md` says to keep.
- Tell Joe in a few lines what you take as already decided and what looks open.
  Let him correct that before the first question.

## Core beats (one at a time)

**1. Walk the decided behaviors.** For each one (meme drops, reactions, callbacks,
heartbeat, morning gm, replies…), turn the casual description into a precise one:
what sets it off, what Homer does, what he does not do.

**2. What "working" means.** A bot has no screen, so ask it openly: "How would you
know this is going well?" The answer might be something visible in the chat, a log
line, a post on Homer's profile, how the room responds over a week, or just a
feeling Joe can describe. Capture whatever the honest answer is. Where a check can
be made concrete, make it concrete; where it is a matter of taste, say so and note
who judges.

**3. The room.** Who is in the chat and what each kind of person should experience:
active members, silent members, people who never met Signal Homer, people who want
him gone, Joe as operator. What does opting out look like?

**4. Never.** Things Homer must not do, however the model feels that day: privacy,
volume, topics, actions outside the chat. Separate hard rules (enforced in code)
from preferences (left to the persona).

**5. What ifs.** Aim for two or three real "hadn't thought of that" moments:
Homer offline for a day, a pile-up of messages, someone baiting him, a bad reply
already sent, the model or API failing, Joe wanting to stop him right now.

**6. Guard the scope.** When the list grows, sort it: v1, later, never. Ask what
the smallest version is that Joe would be glad to have running in the group.

## Deepening rounds

Per the guide. Good material: how behaviors interact (heartbeat lands mid-argument),
memory and how far back it reaches, how Homer changes as the room changes, what
would make him feel alive rather than merely functional, what Signal Homer got
wrong, assumptions about how members will react.

## Write `docs/prd.md`

```
# Homer on Bluesky — requirements

## Purpose            why Homer exists in this chat, in 2–3 sentences
## The room           who is there and what each should experience
## Behaviors
### [Behavior name]   one heading per behavior, stable and plain
- Trigger:            what sets it off
- Does:               what Homer does
- Working when:       observable check, or the judgment call and who makes it
- Edge cases:
## Hard rules         enforced in code, each with a one-line reason
## Operator controls  what Joe can see, pause, and change
## v1 / later / never
## Open questions     marked: must answer before /spec, or can wait
```

Add sections the conversation calls for; drop ones it does not. Then do the
after-doc steps from the guide. Next skill: `/spec`.
