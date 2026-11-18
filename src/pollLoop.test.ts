import { describe, expect, it } from "vitest";
import { backoffSecondsAfterFailures, runPollLoop } from "./pollLoop.ts";
import { describeNewMessage } from "./handleNewMessage.ts";

// Run the loop for a fixed number of polls; each outcome is "ok" or an error to throw.
async function runWithOutcomes(outcomes: ("ok" | Error)[]) {
  const sleeps: number[] = [];
  const lines: string[] = [];
  let pollNumber = 0;
  await runPollLoop({
    pollSeconds: 30,
    pollOnce: async () => {
      const outcome = outcomes[pollNumber++];
      if (outcome !== "ok") throw outcome;
    },
    sleep: async (seconds) => void sleeps.push(seconds),
    logLine: (line) => lines.push(line),
    shouldKeepRunning: () => pollNumber < outcomes.length,
  });
  return { sleeps, lines };
}

describe("backoff steps", () => {
  it("doubles from 30s and caps at 5 minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(backoffSecondsAfterFailures)).toEqual([30, 60, 120, 240, 300, 300, 300]);
  });

  it("waits the poll interval after a success", async () => {
    expect((await runWithOutcomes(["ok", "ok"])).sleeps).toEqual([30, 30]);
  });

  it("backs off on repeated failures, including a 429, and resets after a success", async () => {
    const rateLimited = Object.assign(new Error("Rate Limit Exceeded"), { status: 429 });
    const outcomes: ("ok" | Error)[] = [
      new Error("fetch failed"), rateLimited, new Error("x"), new Error("x"), new Error("x"), new Error("x"),
      "ok", new Error("fetch failed"),
    ];
    const { sleeps, lines } = await runWithOutcomes(outcomes);
    expect(sleeps).toEqual([30, 60, 120, 240, 300, 300, 30, 30]);
    expect(lines[1]).toContain("429");
  });

  it("never throws out of the loop", async () => {
    await expect(runWithOutcomes([new Error("boom"), new Error("boom")])).resolves.toBeDefined();
  });
});

describe("describeNewMessage", () => {
  it("prints time, conversation, sender and ID but never the text", () => {
    const event = {
      convoId: "3myzmduu7x32v",
      rev: "r1",
      message: { id: "m1", text: "secret words", sentAt: "2026-11-14T12:00:00Z", sender: { did: "did:joe" } },
      relatedProfiles: [{ did: "did:joe", handle: "joetforhire.com" }],
    };
    const line = describeNewMessage(event, "did:homer");
    expect(line).toBe("2026-11-14T12:00:00Z new message convo=3myzmduu7x32v from=joetforhire id=m1");
    expect(line).not.toContain("secret");
    expect(describeNewMessage({ ...event, message: { ...event.message, sender: { did: "did:homer" } } }, "did:homer")).toContain("from=homer");
  });
});
