import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultState, readState, updateState, writeState } from "./state.ts";

async function makeTemporaryDirectory() {
  return mkdtemp(join(tmpdir(), "homer-state-"));
}

describe("state", () => {
  it("returns every default when the file is missing", async () => {
    const statePath = join(await makeTemporaryDirectory(), "state.json");
    const state = await readState(statePath);
    expect(state).toEqual(createDefaultState());
    expect(state.paused).toBe(false);
    expect(state.pollCursor).toBeNull();
    expect(state.memeLastUsed).toEqual({});
  });

  it("round-trips a written state", async () => {
    const statePath = join(await makeTemporaryDirectory(), "state.json");
    const state = createDefaultState();
    state.paused = true;
    state.pollCursor = "cursor-123";
    state.memeLastUsed = { "3myzmduu7x32v": { "cat.jpeg": "2026-11-14T12:00:00.000Z" } };
    await writeState(state, statePath);
    expect(await readState(statePath)).toEqual(state);
  });

  it("leaves no temp file behind after a write", async () => {
    const directory = await makeTemporaryDirectory();
    await writeState(createDefaultState(), join(directory, "state.json"));
    expect(await readdir(directory)).toEqual(["state.json"]);
  });

  it("fills fields missing from an older file with defaults", async () => {
    const statePath = join(await makeTemporaryDirectory(), "state.json");
    await writeFile(statePath, JSON.stringify({ paused: true }));
    const state = await readState(statePath);
    expect(state.paused).toBe(true);
    expect(state.skippedMentionIds).toEqual([]);
  });

  it("throws on a corrupt file instead of silently resetting", async () => {
    const statePath = join(await makeTemporaryDirectory(), "state.json");
    await writeFile(statePath, "{ not json");
    await expect(readState(statePath)).rejects.toThrow();
  });

  it("updateState reads, changes and writes", async () => {
    const statePath = join(await makeTemporaryDirectory(), "state.json");
    await updateState((state) => { state.lastGmDate = "2026-11-14"; }, statePath);
    const savedText = await readFile(statePath, "utf8");
    expect(JSON.parse(savedText).lastGmDate).toBe("2026-11-14");
  });
});
