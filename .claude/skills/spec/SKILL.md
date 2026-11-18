---
name: spec
description: Use when Joe says "/spec" or wants to turn Homer's requirements into a technical blueprint — stack, architecture, data flow, file structure.
---

# /spec — how Homer is built

Read `.claude/skills/homer-guide/SKILL.md` first and follow it.

You are a technical collaborator. Interview first, propose second. Build the
design with Joe one section at a time; he should finish able to explain every
part of it.

## Prerequisites

`docs/prd.md` must exist. If not: "Run `/prd` first."

## Before you start

- Read everything in `docs/`, the v0 Python files, and `persona.md`.
- Read the parts of Signal Homer (`~/Developer/archive/homer/src/`) that match
  the PRD's behaviors. Note what could be reused, ported, or learned from.
- Check `prd.md > Open questions` for anything marked "before /spec" and settle
  those first.

## Core beats (one at a time)

**1. Language and reuse.** `design-interview.md` says TypeScript to reuse Signal
Homer's code; v0 is Python. Lay out the trade-off plainly and let Joe decide.
Ask what he wants to learn along the way.

**2. Where it runs.** Joe's Mac is the stated host. What happens on sleep, reboot,
network loss? How is it started, stopped, and watched?

**3. Research before proposing.** Look up current docs for every library and API
in play (atproto chat, OpenRouter, anything new). Check maintenance, limits, and
known issues. Share the links. Do not rely on memory for API details.

**4. Architecture, one behavior at a time.** For each heading in `prd.md > Behaviors`,
propose the component that implements it, say why, and ask for Joe's reaction.
Show how the hard rules are enforced in code rather than left to the model.

**5. State and data flow.** For every piece of data (cursor, transcript, meme
index, cooldowns, memory): where it lives, who writes it, what happens when it is
lost. Trace one message from arrival to reply. Draw it.

**6. File structure.** The full tree, every file annotated with its purpose.
Joe prefers many short files (under 100 lines), functions over classes, and
readable names.

## Deepening rounds

Per the guide. Good material: exact API calls and response shapes, the two or
three places it will actually break and the fallback for each, cost per day, how
to test a behavior without posting to the real group, how Joe inspects what
Homer saw and why he replied. Finish with a self-review: any PRD behavior with
no home, any ambiguity `/build` would trip on — raise two or three as real
questions.

## Write `docs/spec.md`

```
# Homer on Bluesky — technical spec

## Stack                  with doc links and a line of rationale each
## Runtime                host, process management, env vars, recovery
## Architecture overview  diagram of components and connections
## [Component]            one heading per component, with subheadings
                          "Implements: prd.md > [Behavior]"
## Data and state         each store: shape, owner, loss behavior
## Message lifecycle      arrival → decision → reply, step by step
## File structure         annotated tree
## Testing and dry runs   how to try things without touching the group
## Key decisions          what, why, trade-off accepted
## Open issues
```

Every component gets its own heading so `/checklist` can point at it. Then do
the after-doc steps from the guide. Next skill: `/checklist`.
