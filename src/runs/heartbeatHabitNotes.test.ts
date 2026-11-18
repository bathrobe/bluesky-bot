import { describe, expect, it } from "vitest";
import { HOMER_DID, makeMessage, memeEmbed } from "../transcript.fixtures.ts";
import { buildHabitNoteLines, repeatedWords } from "./heartbeatHabitNotes.ts";

const homerSays = (id: string, text: string, extra = {}) => makeMessage({ id, text, sender: { did: HOMER_DID }, ...extra });
const joeSays = (id: string) => makeMessage({ id, text: "x" });

describe("heartbeat habit notes", () => {
  it("says nothing when Homer has not spoken", () => {
    expect(buildHabitNoteLines([joeSays("j1")], HOMER_DID)).toEqual([]);
  });

  it("counts new messages from others and calls a quiet room reactions only", () => {
    const [paceLine] = buildHabitNoteLines([homerSays("h1", "soup"), joeSays("j1")], HOMER_DID);
    expect(paceLine).toContain("- 1 messages from other people since your last message. under 4, so this tick is reactions only");
    const busy = [homerSays("h1", "soup"), ...["j1", "j2", "j3", "j4"].map(joeSays)];
    expect(buildHabitNoteLines(busy, HOMER_DID)[0]).toBe("- 4 messages from other people since your last message.");
  });

  it("gives the mix of his recent messages", () => {
    const otherPost = { record: { uri: "at://did:plc:someoneelse/app.bsky.feed.post/3fake" } };
    const messages = [homerSays("h1", "", { embed: memeEmbed }), homerSays("h2", "look", { embed: otherPost }), homerSays("h3", "soup")];
    expect(buildHabitNoteLines(messages, HOMER_DID)[1]).toBe("- your last 3 messages: 1 meme, 1 bluesky post, 1 plain text.");
  });

  it("lists words used in three or more of his recent messages, singular and plural together", () => {
    const messages = ["horses west", "the horse knows", "grab a horse", "soup is a drink"].map((body, index) => homerSays(`h${index}`, body));
    expect(repeatedWords(messages)).toEqual(["horse (3)"]);
    expect(buildHabitNoteLines(messages, HOMER_DID)[2]).toContain("words in several of those messages: horse (3).");
  });
});
