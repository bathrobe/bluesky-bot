import { describe, expect, it, vi } from "vitest";
import { TEST_DM_CONVO_ID } from "../config.ts";
import { describeAction, executePlan, summarizeLiveRun } from "./executePlan.ts";

const reactAction = { type: "react" as const, messageId: "m1", emoji: "👀" };
const firstText = { type: "text" as const, text: "one" };
const secondText = { type: "text" as const, text: "two", replyTo: "m1" };
const plan = { reason: "the room is quiet", actions: [reactAction, firstText, secondText] };
const emptyPlan = { reason: "nothing fits", actions: [] };

function runWith(sendAction: any, dryRun = false, planToRun: any = plan) {
  const lines: string[] = [];
  const options = { dryRun, convoId: TEST_DM_CONVO_ID, sendAction, printLine: (line: string) => lines.push(line) };
  return executePlan(planToRun, options).then((sentRecords) => ({ sentRecords, lines }));
}

describe("executePlan, dry", () => {
  it("prints each action and sends nothing", async () => {
    const sendAction = vi.fn();
    const { sentRecords, lines } = await runWith(sendAction, true);
    expect(sentRecords).toEqual([]);
    expect(lines[1]).toBe("  1. react 👀 on {m1}");
    expect(describeAction(secondText)).toBe('text (reply to {m1}): "two"');
    expect((await runWith(sendAction, true, emptyPlan)).lines.at(-1)).toBe("dry run: skip (no actions)");
    expect(sendAction).not.toHaveBeenCalled();
  });
});

describe("executePlan, live", () => {
  it("sends every action in order and records each id", async () => {
    const sendAction = vi.fn(async (action: any) => ({ sent: true as const, messageId: action.messageId ?? `new-${action.text}` }));
    const { sentRecords } = await runWith(sendAction);
    expect(sendAction.mock.calls.map((call) => call[0])).toEqual(plan.actions);
    expect(sentRecords).toEqual([
      { action: reactAction, messageId: "m1" },
      { action: firstText, messageId: "new-one" },
      { action: secondText, messageId: "new-two" },
    ]);
    expect(summarizeLiveRun(plan, sentRecords)).toEqual({ outcome: "posted", error: null });
  });

  it("logs a send error, does not retry it, and drops the remaining actions", async () => {
    const sendAction = vi.fn().mockResolvedValueOnce({ sent: true, messageId: "m1" }).mockRejectedValueOnce(new Error("503 from chat"));
    const { sentRecords, lines } = await runWith(sendAction);
    expect(sendAction).toHaveBeenCalledTimes(2); // the third action was never tried
    expect(sentRecords).toEqual([{ action: reactAction, messageId: "m1" }, { action: firstText, error: "503 from chat" }]);
    expect(lines.at(-1)).toContain("FAILED (503 from chat); 1 remaining action(s) dropped");
    // Something landed, so the run counts as posted (a retry would repeat it); the error is kept.
    expect(summarizeLiveRun(plan, sentRecords)).toMatchObject({ outcome: "posted", error: expect.stringContaining("503 from chat") });
  });

  it("is failed when the first send errors and nothing landed", async () => {
    const { sentRecords } = await runWith(vi.fn().mockRejectedValue(new Error("boom")));
    expect(sentRecords).toHaveLength(1);
    expect(summarizeLiveRun(plan, sentRecords)).toMatchObject({ outcome: "failed", error: expect.stringContaining("boom") });
  });

  it("stops when the Sender reports paused", async () => {
    const sendAction = vi.fn(async () => ({ sent: false as const, reason: "paused" }));
    const { sentRecords } = await runWith(sendAction);
    expect(sendAction).toHaveBeenCalledTimes(1);
    expect(sentRecords).toEqual([{ action: reactAction, error: "not sent: paused" }]);
    expect(summarizeLiveRun(plan, sentRecords).outcome).toBe("failed");
  });

  it("an empty plan is a deliberate skip: nothing sent", async () => {
    const sendAction = vi.fn();
    const { sentRecords, lines } = await runWith(sendAction, false, emptyPlan);
    expect(sentRecords).toEqual([]);
    expect(lines).toEqual(["live: skip (no actions)"]);
    expect(sendAction).not.toHaveBeenCalled();
    expect(summarizeLiveRun(emptyPlan, [])).toEqual({ outcome: "skipped", error: null });
  });

  it("throws rather than guess when a live run has no sendAction", async () => {
    await expect(runWith(undefined)).rejects.toThrow("needs sendAction");
  });
});
