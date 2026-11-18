---
name: build
description: Use when Joe says "/build" or wants to execute Homer's build checklist — one item at a time, or the whole list.
---

# /build — do the work

Read `.claude/skills/homer-guide/SKILL.md` first and follow it.

You are an executor. The plan lives in `docs/checklist.md`; follow it and the
preferences in its header. Do not add, reorder, or skip items on your own.

## Prerequisites

`docs/checklist.md` must exist. If not: "Run `/checklist` first."

## Before you start

Read everything in `docs/`. If every item is checked, say so, summarize what was
built, and stop.

## Step-by-step mode

One item per run.

1. **Announce.** The first unchecked item: what it is and why it comes now. Two
   or three sentences.
2. **Build.** Read the item's spec ref and PRD behavior, then do the work in the
   Build field. Narrate as much as the header asks for. Small files, functions,
   readable names.
3. **Verify** (if on). Follow the Verify field exactly. Run what you can yourself
   and show the output; ask Joe to do the parts only he can (reading the chat on
   his phone, judging a reply's tone). The item is not done until this passes.
4. **Comprehension check** (if on). One multiple-choice question via
   AskUserQuestion, specific to what was just built, with a single correct
   answer findable in the code. If Joe misses it, explain in two or three
   sentences and move on.
5. **Mark and log.** Check the box. Commit if the header says to. Append to
   `docs/process-notes.md` under `## /build > Step N`: what was built, what
   verification showed, any problems.
6. **Hand off.** "Step N done. Run `/clear`, then `/build` for the next one."

## Autonomous mode

One run works the whole list. For each unchecked item in order:

1. Dispatch it to a subagent with the full item, all of `docs/spec.md`, the
   relevant PRD behavior, and Joe's code-style preferences. Ask it to build,
   commit, and report what it did and what it could not verify.
2. Check the box.
3. Every 3–4 items (if verification is on), pause: summarize what now exists,
   say what to try, and wait for Joe's answer before continuing.

Write one summary to `docs/process-notes.md` at the end instead of per-item notes.

## The real group

Sending to any conversation other than the test DM, accepting the group invite,
and posting publicly from Homer's account each need Joe's explicit go-ahead at
the moment they happen, even when a checklist item calls for them.

## When something breaks

If an item fails and a reasonable attempt does not fix it, stop.

1. Say what you tried, what went wrong, and why it is not a quick fix.
2. If the code is in a broken state, propose going back to the last commit that
   passed verification.
3. Look at the whole checklist: does this item need splitting, does a later item
   rest on the same wrong assumption, is there a gap in the spec?
4. Propose specific edits to the checklist (and spec, if needed). Change them
   only after Joe agrees, then resume.

Plans change when they meet reality; that is the plan working, not failing.
