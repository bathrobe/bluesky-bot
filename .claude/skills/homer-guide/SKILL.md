---
name: homer-guide
description: >
  Shared behavior for the Homer planning workflow: /prd, /spec, /checklist, /build.
  Loaded by those four skills; not used directly.
user-invocable: false
---

# Homer workflow — shared behavior

Joe is building Homer, an LLM group-chat bot on Bluesky. The idea is already
scoped. These skills take it from requirements to working code:

```
/prd → /spec → /checklist → /build
```

Each skill writes one doc in `docs/` that the next one reads. Run them in order.
If a prerequisite doc is missing, name the skill to run and stop.

## What already exists

Read these before any interview. Never re-ask what they already answer.

- `docs/design-interview.md` — decisions and open questions so far. This is the scope.
- `persona.md` — Homer's voice and guardrails.
- The Python files in the repo root — a working v0 (poll, transcript, one LLM call, reply).
  A prototype, not a commitment.
- `~/Developer/archive/homer` — **Signal Homer**, the earlier bot this one descends from
  (TypeScript; see its `skills/`, `src/`, `docs/`). Use it as reference: when a behavior
  existed there, read how it worked and ask Joe what to keep, change, or drop. It is
  evidence of what worked, not a spec to copy.

## Tone

Follow Joe's global preferences: terse, slow, teach briefly where it helps.
Sharp collaborator, not a cheerleader. Push for specifics. Disagree when warranted.

## Interviewing

- **One question at a time.** Ask, wait, then ask the next.
- **Free-form questions only** in planning. No multiple-choice tools. Long spoken
  answers are welcome; short questions, long answers.
- **Adapt.** Each skill lists beats, not a script. Skip a beat the docs or an earlier
  answer already cover. Follow a thread that matters more than the next beat.
- **Reflect back.** After a long answer, restate what you took from it in 1–3 lines
  so Joe can correct you before it reaches a doc.

## Deepening rounds

After a skill's core beats, offer the choice: generate the doc now, or do another
round. A round is 4–5 new questions, one at a time, aimed at edge cases, thin
answers, and assumptions Joe may not know he is making. Offer again after each
round. Joe decides when to stop.

## After writing a doc

1. **Feedback** — 2–4 lines, ✓ for what is strong, △ for what is thin. Honest, not a grade.
2. **Process notes** — append to `docs/process-notes.md` under a heading for the skill:
   decisions and why, what Joe pushed back on, what stayed uncertain.
3. **Skill feedback** — ask Joe one question about the skill itself (what dragged,
   what was missing, what he would change). Log the answer under `## Skill feedback`
   in `docs/process-notes.md`. Joe is refining these skills; this log is the input.
4. **Handoff** — tell Joe to run `/clear`, then the next skill.

## Headings are addresses

Later docs point at earlier ones by heading (`prd.md > Meme drops`). Keep headings
plain, descriptive, and stable once written.
