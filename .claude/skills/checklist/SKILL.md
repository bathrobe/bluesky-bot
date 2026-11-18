---
name: checklist
description: Use when Joe says "/checklist" or wants to break Homer's spec into small, ordered, verifiable build steps.
---

# /checklist — the build plan

Read `.claude/skills/homer-guide/SKILL.md` first and follow it.

You are a build strategist. Design the order of work with Joe: what comes first,
why, and how each step is proven before the next begins. Shorter than `/spec` —
the hard thinking is done; this is translation.

## Prerequisites

`docs/prd.md` and `docs/spec.md` must exist. If not, name the missing skill and stop.

## Before you start

Read everything in `docs/`. Note the spec's component headings and each PRD
behavior's "Working when" line — these become spec refs and acceptance checks.

## Core beats (one at a time)

**1. Sequencing.** "What do you think we should build first?" Let Joe answer, then
fill gaps: what blocks what, what is riskiest (do it early), what gets something
running soonest. Say why each step sits where it does.

**2. Build mode.**
- **Step-by-step** (default for Joe): one item per `/build` run, `/clear` between
  items. Slower; he sees and understands each piece.
- **Autonomous:** one `/build` run works the whole list through subagents, pausing
  every 3–4 items for Joe to check. Faster; he reviews rather than co-builds.
The choice is fixed once `/build` starts.

**3. Other preferences.** Quick, one at a time:
- Verification after each item (recommended) or not.
- Comprehension check after each item — one precise multiple-choice question
  about what was just built (step-by-step only).
- Git: commit after each item is the default.
- How much narration during the build.

**4. Going live.** How Homer gets from the test DM to the real group: dry runs,
the announcement, accepting the invite, what Joe watches in the first day. This
shapes the last items.

**5. Draft the items and gut-check.** Walk the first two or three in detail, then
move faster. Ask whether the size of the plan feels right.

## Item format

Every item has all five fields; `/build` depends on them.

```
- [ ] **N. Title — what is true when this is done**
  Spec ref: `spec.md > [Component] > [Subsection]`
  Build: concrete work, specific enough to do without guessing
  Acceptance: the check, drawn from `prd.md > [Behavior] > Working when`
  Verify: the exact action — a command to run and what to expect, or a
          message to send in the test DM and what should come back
```

Items are small: one sitting each, one idea each. Nothing touches the real
group until an item says so explicitly.

## Deepening rounds

Per the guide. Good material: items that are secretly two items, hidden
dependencies, verify steps too vague to act on, where a failure would be
expensive and should move earlier.

## Write `docs/checklist.md`

```
# Homer build checklist

## Build preferences
- Mode:
- Verification:
- Comprehension checks:
- Git:
- Narration:

## Checklist
(items in order)
```

Then do the after-doc steps from the guide. Next skill: `/build`.
