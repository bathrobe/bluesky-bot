import { describe, expect, it } from "vitest";
import { GROUP_CONVO_ID, TEST_DM_CONVO_ID } from "../config.ts";
import { keepNewMessagesFromAllowedConvos, pollNewMessages } from "./poll.ts";

const allowedConvoIds = [TEST_DM_CONVO_ID];
const WINE_DARK_SKY_CONVO_ID = "3mnzxjbfwqk2i";

function createMessageLog(convoId: string, id: string, rev = `rev-${id}`) {
  return {
    $type: "chat.bsky.convo.defs#logCreateMessage",
    convoId,
    rev,
    message: { $type: "chat.bsky.convo.defs#messageView", id, text: "hi", sender: { did: "did:joe" } },
  };
}

// A group event whose message throws if anything touches it: proves it is dropped unread.
function untouchableLog(convoId: string) {
  const log: any = { $type: "chat.bsky.convo.defs#logCreateMessage", convoId, rev: "rev-x" };
  Object.defineProperty(log, "message", { get: () => { throw new Error("group message was read"); } });
  return log;
}

describe("keepNewMessagesFromAllowedConvos", () => {
  it("group event is dropped", () => {
    const logs = [untouchableLog(GROUP_CONVO_ID), untouchableLog(WINE_DARK_SKY_CONVO_ID)];
    expect(keepNewMessagesFromAllowedConvos(logs, allowedConvoIds)).toEqual([]);
  });

  it("keeps a new message in the test DM", () => {
    const events = keepNewMessagesFromAllowedConvos([createMessageLog(TEST_DM_CONVO_ID, "m1")], allowedConvoIds);
    expect(events.map((event) => event.message.id)).toEqual(["m1"]);
    expect(events[0].convoId).toBe(TEST_DM_CONVO_ID);
  });

  it("passes on only logCreateMessage with a real message view", () => {
    const logs = [
      { $type: "chat.bsky.convo.defs#logBeginConvo", convoId: TEST_DM_CONVO_ID, rev: "a" },
      { ...createMessageLog(TEST_DM_CONVO_ID, "m2"), $type: "chat.bsky.convo.defs#logAddReaction" },
      { ...createMessageLog(TEST_DM_CONVO_ID, "m3"), $type: "chat.bsky.convo.defs#logDeleteMessage" },
      { ...createMessageLog(TEST_DM_CONVO_ID, "m4"), message: { $type: "chat.bsky.convo.defs#deletedMessageView", id: "m4" } },
      createMessageLog(TEST_DM_CONVO_ID, "m5"),
    ];
    expect(keepNewMessagesFromAllowedConvos(logs, allowedConvoIds).map((event) => event.message.id)).toEqual(["m5"]);
  });
});

describe("pollNewMessages", () => {
  it("with no cursor starts from now and passes nothing on", async () => {
    const calls: (string | undefined)[] = [];
    const result = await pollNewMessages({
      cursor: null,
      allowedConvoIds,
      fetchLogPage: async (cursor) => (calls.push(cursor), { logs: [createMessageLog(TEST_DM_CONVO_ID, "old")], cursor: "now" }),
    });
    expect(result).toEqual({ events: [], joins: [], cursor: "now" });
    expect(calls).toEqual([undefined]);
  });

  it("follows pages until one comes back empty, dropping group events", async () => {
    const pages: Record<string, any> = {
      c0: { logs: [createMessageLog(TEST_DM_CONVO_ID, "m1"), untouchableLog(GROUP_CONVO_ID)], cursor: "c1" },
      c1: { logs: [untouchableLog(GROUP_CONVO_ID), createMessageLog(TEST_DM_CONVO_ID, "m2")], cursor: "c2" },
      c2: { logs: [], cursor: "c2" },
    };
    const result = await pollNewMessages({ cursor: "c0", allowedConvoIds, fetchLogPage: async (cursor) => pages[cursor!] });
    expect(result.events.map((event) => event.message.id)).toEqual(["m1", "m2"]);
    expect(result.cursor).toBe("c2");
  });

  it("stops at the page cap and keeps the cursor it reached", async () => {
    let pageNumber = 0;
    const fetchLogPage = async () => ({ logs: [createMessageLog(TEST_DM_CONVO_ID, `m${pageNumber}`)], cursor: `c${++pageNumber}` });
    const result = await pollNewMessages({ cursor: "c0", allowedConvoIds, fetchLogPage, maxPages: 3 });
    expect(result.events).toHaveLength(3);
    expect(result.cursor).toBe("c3");
  });

  it("keeps the old cursor when a page has none", async () => {
    const result = await pollNewMessages({ cursor: "c0", allowedConvoIds, fetchLogPage: async () => ({ logs: [] }) });
    expect(result).toEqual({ events: [], joins: [], cursor: "c0" });
  });
});
