// Operator alerts (spec.md > Off switch): at most one per Eastern day, tracked in state.lastAlertDate.
// Fake chat agent and fake state: nothing real is read or sent. Runs under `pnpm test offSwitch`.
import { describe, expect, it } from "vitest";
import { makeFakeSendContext } from "../bluesky/send.ts.fakes.ts";
import { sendOperatorAlert } from "../bluesky/send.ts";

describe("operator alert: one per Eastern day", () => {
  it("a second alert the same day is not sent; the next day's is", async () => {
    const fake = makeFakeSendContext();
    const morning = new Date("2026-11-14T14:00:00Z"); // 9am ET
    const lateEvening = new Date("2026-11-15T03:30:00Z"); // 10:30pm ET, still Nov 14 in Eastern time
    expect((await sendOperatorAlert(fake.context, "first", morning)).sent).toBe(true);
    expect(fake.fakeState.lastAlertDate).toBe("2026-11-14");
    expect(await sendOperatorAlert(fake.context, "second", lateEvening)).toEqual({ sent: false, reason: "alerted-today" });
    expect((await sendOperatorAlert(fake.context, "next day", new Date("2026-11-15T14:00:00Z"))).sent).toBe(true);
    expect(fake.sentMessages().map((request) => request.message.text)).toEqual(["first", "next day"]);
  });

  it("a paused alert is not sent and does not use up the day", async () => {
    const fake = makeFakeSendContext(true);
    expect(await sendOperatorAlert(fake.context, "alert")).toEqual({ sent: false, reason: "paused" });
    expect(fake.fakeState.lastAlertDate).toBeNull();
  });
});
