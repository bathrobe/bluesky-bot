import { describe, expect, it } from "vitest";
import { buildTranscript } from "./transcript.ts";
import { shortenHandle } from "./bluesky/history.ts";
import {
  JOE_DID,
  NOW_MS,
  fixtureMessages,
  makeMessage,
  shortHandleByDid,
} from "./transcript.fixtures.ts";

const options = { nowMs: NOW_MS, shortHandleByDid, header: false };

describe("transcript", () => {
  it("renders one line per message, oldest first, each ending in {id}", () => {
    expect(buildTranscript(fixtureMessages, options)).toBe(
      [
        "[3h ago] joe: who wants soup tonight [👍 homer · 😂 joe]   {3aaaaaaaaaa01}",
        "[2h ago] homer ↳ joe: soup is a drink / fight me   {3aaaaaaaaaa02}",
        '[1h ago] homer: (shared post by winedark.ink, image: "a cat wearing a tiny crown")   {3aaaaaaaaaa04}',
        "[just now] joe ↳ deleted message: rude   {3aaaaaaaaaa05}",
      ].join("\n"),
    );
  });

  it("leaves deleted messages out", () => {
    expect(buildTranscript(fixtureMessages, options)).not.toContain("{3aaaaaaaaaa03}");
  });

  it("quotes a reply's parent when the parent is not in view", () => {
    const parentOutOfView = makeMessage({ id: "3old000000001", text: "remember the horse", sender: { did: JOE_DID } });
    const reply = makeMessage({ id: "3new000000001", text: "yes", replyTo: parentOutOfView });
    expect(buildTranscript([reply], options)).toContain('joe ↳ joe ("remember the horse"): yes');
  });

  it("names an unknown sender 'someone' and an empty message '(empty)'", () => {
    const stranger = makeMessage({ id: "3x00000000001", sender: { did: "did:plc:stranger" } });
    expect(buildTranscript([stranger], options)).toContain("someone: (empty)");
  });

  it("adds a header with the time and the id legend by default", () => {
    const transcript = buildTranscript(fixtureMessages, { nowMs: NOW_MS, shortHandleByDid });
    expect(transcript.split("\n")[0]).toMatch(/^recent chat, oldest first\. now: sat, 3:00 pm est\./);
  });

  it("says so when there are no messages", () => {
    expect(buildTranscript([], options)).toBe("(no messages)");
  });

  it("shortens handles", () => {
    expect(shortenHandle("joetforhire.com")).toBe("joetforhire");
    expect(shortenHandle("someone.bsky.social")).toBe("someone");
  });
});
