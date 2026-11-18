import { describe, expect, it } from "vitest";
import { react, text } from "../plan/validatePlanTestHelpers.ts";
import { fakeLookupTool, postReply, runScript, toolCallReply } from "./toolLoopTestHelpers.ts";

const foundId = "3foundbysearch";
const lastToolResult = (call: any) => call.messages[call.messages.length - 1];

describe("runToolLoop: lookup tools", () => {
  it("offers registered lookups, runs one, and feeds its result back", async () => {
    const search = fakeLookupTool("search_chat", { resultText: "1 match: {3foundbysearch} joe: soup" });
    const { result, calls } = await runScript(
      [toolCallReply("search_chat", { keywords: ["soup"] }), postReply(text("found it"))],
      { lookupTools: { search_chat: search.tool } },
    );
    expect(result.ok).toBe(true);
    expect(calls[0].tools.map((tool: any) => tool.function.name)).toEqual(["post", "search_chat"]);
    expect(search.receivedArguments).toEqual([{ keywords: ["soup"] }]);
    expect(lastToolResult(calls[1]).role).toBe("tool");
    expect(lastToolResult(calls[1]).content).toMatch(/1 match.*\n\n\(lookups left this run: 3\)/);
    expect(result.turns[0].toolCalls[0]).toMatchObject({ name: "search_chat", outcome: "lookup" });
    expect(result.lookupCallsUsed).toBe(1);
  });

  it("ids a lookup returns become real for the plan check; without the lookup they are rejected", async () => {
    const search = fakeLookupTool("search_chat", { resultText: "1 match", messageIds: [foundId] });
    const replyToFound = () => postReply(text("as foretold", foundId), react(foundId, "🐴"));
    const withLookup = await runScript([toolCallReply("search_chat", {}), replyToFound()], { lookupTools: { search_chat: search.tool } });
    expect(withLookup.result.ok).toBe(true);
    expect(withLookup.result.knownMessageIds).toContain(foundId);
    const withoutLookup = await runScript([replyToFound(), postReply()]);
    expect(withoutLookup.result.rejectedPlans).toHaveLength(1);
  });

  it("the cap of 4 is shared: the fifth lookup does not run and the model is told to post", async () => {
    const searchChat = fakeLookupTool("search_chat", { resultText: "no matches" });
    const searchBluesky = fakeLookupTool("search_bluesky", { resultText: "no posts" });
    const lookups = ["search_chat", "search_bluesky", "search_chat", "search_bluesky", "search_chat"];
    const { result, calls } = await runScript(
      [...lookups.map((name) => toolCallReply(name, {})), postReply()],
      { lookupTools: { search_chat: searchChat.tool, search_bluesky: searchBluesky.tool } },
    );
    expect(result.ok).toBe(true);
    expect(searchChat.receivedArguments.length + searchBluesky.receivedArguments.length).toBe(4);
    expect(lastToolResult(calls[5]).content).toMatch(/lookups are used up \(4 per run\).*call post/);
    expect(result.turns[4].toolCalls[0].outcome).toBe("lookup-cap");
    expect(result.lookupCallsUsed).toBe(4);
  });

  it("an unknown tool name gets an error tool result, not a crash", async () => {
    const { result, calls } = await runScript([toolCallReply("send_message", { text: "hi" }), postReply()]);
    expect(result.ok).toBe(true);
    expect(lastToolResult(calls[1]).content).toMatch(/no tool named "send_message".*post/);
    expect(result.turns[0].toolCalls[0].outcome).toBe("unknown-tool");
  });

  it("a lookup that throws becomes an error tool result and still counts toward the cap", async () => {
    const broken = fakeLookupTool("search_chat", new Error("network down"));
    const { result, calls } = await runScript([toolCallReply("search_chat", {}), postReply()], { lookupTools: { search_chat: broken.tool } });
    expect(result.ok).toBe(true);
    expect(lastToolResult(calls[1]).content).toMatch(/search_chat failed: network down/);
    expect(result.lookupCallsUsed).toBe(1);
  });

  it("a successful lookup between two rejected plans means they are not in a row", async () => {
    const search = fakeLookupTool("search_chat", { resultText: "no matches" });
    const rejectedPost = () => postReply(react("3madeupid", "🍲"));
    const { result } = await runScript(
      [rejectedPost(), toolCallReply("search_chat", {}), rejectedPost(), postReply()],
      { lookupTools: { search_chat: search.tool } },
    );
    expect(result.ok).toBe(true);
    expect(result.rejectedPlans).toHaveLength(2);
  });
});
