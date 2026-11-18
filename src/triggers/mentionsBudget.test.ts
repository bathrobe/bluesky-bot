// The @ budget: 4 answers in 15 minutes, then one brush-off, then skips. Pure functions, fixed clock.
import { describe, expect, it } from "vitest";
import { config } from "../config.ts";
import { createDefaultState } from "../state.ts";
import { decideAtReplyBudget, pruneAtReplyTimes, recordAnsweredMention, recordSkippedMention } from "./mentionsBudget.ts";

const CONVO = config.testDmConvoId;
const START_MS = Date.parse("2026-11-14T20:00:00.000Z");
const minutesAfterStart = (minutes: number) => new Date(START_MS + minutes * 60_000);
const decide = (state: any, now: Date, convoId = CONVO) => decideAtReplyBudget(state.atReplyTimesByConvo[convoId] ?? [], now.getTime());

// What item 25 does for each @: decide, then record a post (answer or brush-off) or a skip.
function handleMentionAt(state: any, mentionMessageId: string, now: Date) {
  const decision = decide(state, now);
  const nextState = decision === "skip" ? recordSkippedMention(state, mentionMessageId) : recordAnsweredMention(state, CONVO, now);
  return { decision, nextState };
}

describe("mentionsBudget", () => {
  it("the numbers live in config: 4 per 15 minutes", () => {
    expect(config.caps.atRepliesPerWindow).toBe(4);
    expect(config.caps.atReplyWindowMinutes).toBe(15);
  });

  it("four answers, the fifth @ in 15 minutes is a brush-off, the sixth is skipped; then answering resumes", () => {
    let state: any = createDefaultState();
    const decisions: string[] = [];
    for (let mentionNumber = 1; mentionNumber <= 7; mentionNumber++) {
      const result = handleMentionAt(state, `mention${mentionNumber}`, minutesAfterStart(mentionNumber)); // 20:01 … 20:07
      decisions.push(result.decision);
      state = result.nextState;
    }
    expect(decisions).toEqual(["answer", "answer", "answer", "answer", "brush-off", "skip", "skip"]);
    expect(state.skippedMentionIds).toEqual(["mention6", "mention7"]);
    expect(state.atReplyTimesByConvo[CONVO]).toHaveLength(5); // 4 answers + the brush-off; skips add nothing

    // 20:15:59 — the first answer (20:01) is still inside the window.
    expect(decide(state, new Date(START_MS + 15 * 60_000 + 59_000))).toBe("skip");
    // 20:16 — the first answer is exactly 15 minutes old and out: 4 left, so no full answer yet.
    expect(decide(state, minutesAfterStart(16))).toBe("brush-off");
    // 20:17 — two are out, three left: answering resumes.
    expect(handleMentionAt(state, "mention8", minutesAfterStart(17)).decision).toBe("answer");
    // 20:21 — everything is out.
    expect(decide(state, minutesAfterStart(21))).toBe("answer");
  });

  it("one conversation's @s do not spend another's budget", () => {
    let state: any = createDefaultState();
    for (let mentionNumber = 1; mentionNumber <= 5; mentionNumber++) state = recordAnsweredMention(state, CONVO, minutesAfterStart(mentionNumber));
    expect(decide(state, minutesAfterStart(6))).toBe("skip");
    expect(decide(state, minutesAfterStart(6), "3someotherconvo")).toBe("answer");
  });

  it("recordAnsweredMention prunes old times, keeps other fields, and does not change its input", () => {
    const before = { ...createDefaultState(), paused: true, atReplyTimesByConvo: { [CONVO]: [minutesAfterStart(0).toISOString()], old: [minutesAfterStart(-60).toISOString()] } };
    const after = recordAnsweredMention(before, CONVO, minutesAfterStart(20));
    expect(after.atReplyTimesByConvo).toEqual({ [CONVO]: [minutesAfterStart(20).toISOString()] });
    expect(after.paused).toBe(true);
    expect(before.atReplyTimesByConvo[CONVO]).toHaveLength(1);
  });

  it("pruneAtReplyTimes keeps what is inside the window and drops empty conversations", () => {
    const times = { a: [minutesAfterStart(0).toISOString(), minutesAfterStart(10).toISOString()], b: [minutesAfterStart(1).toISOString()] };
    expect(pruneAtReplyTimes(times, minutesAfterStart(16).getTime())).toEqual({ a: [minutesAfterStart(10).toISOString()] });
    expect(pruneAtReplyTimes({}, START_MS)).toEqual({});
  });

  it("recordSkippedMention adds an ID once", () => {
    const once = recordSkippedMention(createDefaultState(), "mentionA");
    expect(recordSkippedMention(once, "mentionA")).toBe(once);
    expect(recordSkippedMention(once, "mentionB").skippedMentionIds).toEqual(["mentionA", "mentionB"]);
  });
});
