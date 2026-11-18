// scripts/acceptGroup.ts through fakes only: no network, no real state.json. The flagged path is never run for real.
import { describe, expect, it, vi } from "vitest";
import { GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { createDefaultState, type HomerState } from "../state.ts";
import { runAcceptGroup } from "./acceptGroup.ts";
import { ANNOUNCED_FLAG } from "./acceptGroupPlan.ts";
import { launchSettingsFromState } from "./launchRecord.ts";

const NOW = new Date("2026-11-20T15:00:00.000Z");
const cleanCheck = { entryChecks: [{ file: "a.jpg", problems: [] }], problemEntryCount: 0, ok: true };
const brokenCheck = { entryChecks: [{ file: "a.jpg", problems: ["no post link"] }], problemEntryCount: 1, ok: false };

function makeFakes(overrides: any = {}) {
  const savedState: HomerState = { ...createDefaultState(), lastHeartbeatAt: "2026-11-20T13:00:00.000Z", paused: false };
  const dependencies = {
    stateFileExists: vi.fn(async () => true),
    loadCatalogEntries: vi.fn(async () => [{ file: "a.jpg" }]),
    createSession: vi.fn(async () => ({ fake: "session" })),
    checkFullCatalog: vi.fn(async () => cleanCheck),
    acceptGroupInvite: vi.fn(async () => ({})),
    updateState: vi.fn(async (changeState: (state: HomerState) => void) => (changeState(savedState), savedState)),
    ...overrides,
  };
  const printedLines: string[] = [];
  const run = (commandLineArguments: string[]) =>
    runAcceptGroup({ commandLineArguments, dependencies, now: NOW, printLine: (line) => printedLines.push(line) });
  const expectNothingTouched = () => {
    expect(dependencies.acceptGroupInvite).not.toHaveBeenCalled();
    expect(dependencies.updateState).not.toHaveBeenCalled();
    expect(savedState.groupLaunchedAt).toBeNull();
  };
  return { dependencies, savedState, printedLines, run, expectNothingTouched };
}

describe("runAcceptGroup", () => {
  it("no flag: prints the plan, exit code 1, no session, no file read, nothing written", async () => {
    const fakes = makeFakes();
    expect(await fakes.run([])).toBe(1);
    for (const fakeCall of Object.values(fakes.dependencies)) expect(fakeCall).not.toHaveBeenCalled();
    expect(fakes.printedLines.join("\n")).toContain("Nothing was done");
    expect(fakes.printedLines.join("\n")).toContain(GROUP_CONVO_ID);
  });

  it("a misspelt or extra argument does nothing, even next to the flag", async () => {
    for (const commandLineArguments of [["--joe-has-anounced"], [ANNOUNCED_FLAG, "--force"]]) {
      const fakes = makeFakes();
      expect(await fakes.run(commandLineArguments)).toBe(1);
      for (const fakeCall of Object.values(fakes.dependencies)) expect(fakeCall).not.toHaveBeenCalled();
    }
  });

  it("flag + a catalog problem: refuses, no accept call, nothing written", async () => {
    const fakes = makeFakes({ checkFullCatalog: vi.fn(async () => brokenCheck) });
    expect(await fakes.run([ANNOUNCED_FLAG])).toBe(1);
    fakes.expectNothingTouched();
    expect(fakes.printedLines.join("\n")).toContain("REFUSED");
  });

  it("flag + an empty catalog, or no state.json: refuses before any login", async () => {
    for (const overrides of [{ loadCatalogEntries: vi.fn(async () => []) }, { stateFileExists: vi.fn(async () => false) }]) {
      const fakes = makeFakes(overrides);
      expect(await fakes.run([ANNOUNCED_FLAG])).toBe(1);
      expect(fakes.dependencies.createSession).not.toHaveBeenCalled();
      fakes.expectNothingTouched();
    }
  });

  it("flag + clean catalog: accepts the group once, then writes the launch record", async () => {
    const fakes = makeFakes();
    expect(await fakes.run([ANNOUNCED_FLAG])).toBe(0);
    expect(fakes.dependencies.acceptGroupInvite.mock.calls).toEqual([[{ fake: "session" }, GROUP_CONVO_ID]]);
    expect(fakes.dependencies.updateState).toHaveBeenCalledTimes(1);
    expect(fakes.dependencies.checkFullCatalog.mock.invocationCallOrder[0]).toBeLessThan(fakes.dependencies.acceptGroupInvite.mock.invocationCallOrder[0]);
    expect(fakes.dependencies.acceptGroupInvite.mock.invocationCallOrder[0]).toBeLessThan(fakes.dependencies.updateState.mock.invocationCallOrder[0]);
    expect(fakes.savedState.groupLaunchedAt).toBe(NOW.toISOString());
    expect(fakes.savedState.launchThemeUntil).toBe("2026-11-27T15:00:00.000Z"); // +7 days
    expect(fakes.savedState.lastHeartbeatAt).toBeNull();
    expect(launchSettingsFromState(fakes.savedState)).toEqual({ target: "group", allowedConvoIds: [TEST_DM_CONVO_ID, GROUP_CONVO_ID] });
    expect(fakes.printedLines.at(-1)).toContain("launchctl kickstart");
  });

  it("flag + the state write fails after the accept: exit 1 and says the invite is accepted but Homer is DM only", async () => {
    const fakes = makeFakes({ updateState: vi.fn(async () => Promise.reject(new Error("disk full"))) });
    expect(await fakes.run([ANNOUNCED_FLAG])).toBe(1);
    expect(fakes.dependencies.acceptGroupInvite).toHaveBeenCalledTimes(1);
    expect(fakes.printedLines.join("\n")).toMatch(/STATE WRITE FAILED: disk full[\s\S]*invite IS accepted[\s\S]*still DM only/);
  });
});
