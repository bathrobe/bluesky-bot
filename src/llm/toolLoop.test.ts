import { describe, expect, it } from "vitest";
import { fixtureMessages, react, text } from "../plan/validatePlanTestHelpers.ts";
import { postReply, runScript, startMessages, textReply, toolCallReply } from "./toolLoopTestHelpers.ts";

const soupId = fixtureMessages[0].id;
const validPost = () => postReply(text("soup is good"), react(soupId, "🍲"));
const rejectedPost = () => postReply(react("3madeupid", "🍲")); // not a real message id

describe("runToolLoop: ending in a valid post", () => {
  it("happy path: one post that passes the check ends the run with the plan", async () => {
    const { result, calls } = await runScript([validPost()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.actions).toEqual([text("soup is good"), react(soupId, "🍲")]);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolChoice).toBe("auto");
    expect(calls[0].tools.map((tool: any) => tool.function.name)).toEqual(["post"]);
    expect(calls[0].messages).toEqual(startMessages);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].toolCalls[0]).toMatchObject({ name: "post", outcome: "plan-accepted" });
    expect(result.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(result.model).toBe("fake-model");
    expect(startMessages).toHaveLength(2); // the caller's array is not mutated
  });

  it("an empty actions list is a valid skip", async () => {
    const { result } = await runScript([postReply()]);
    expect(result).toMatchObject({ ok: true, plan: { reason: "test", actions: [] } });
  });

  it("plain-text answer: re-prompted once with tool_choice required, then the post is accepted", async () => {
    const { result, calls } = await runScript([textReply("i think i'll say hi"), validPost()]);
    expect(result.ok).toBe(true);
    expect(calls[1].toolChoice).toBe("required");
    const [assistantText, reprompt] = calls[1].messages.slice(-2);
    expect(assistantText).toEqual({ role: "assistant", content: "i think i'll say hi" });
    expect(reprompt.role).toBe("user");
    expect(reprompt.content).toMatch(/call post/);
    expect(result.turns[0]).toMatchObject({ text: "i think i'll say hi", reprompted: true, toolCalls: [] });
    expect(result.tokens.total).toBe(30);
  });

  it("one rejected plan goes back as the tool result, then a fixed plan succeeds", async () => {
    const firstPost = rejectedPost();
    const { result, calls } = await runScript([firstPost, validPost()]);
    expect(result.ok).toBe(true);
    const [assistantMessage, toolResult] = calls[1].messages.slice(-2);
    expect(assistantMessage).toBe(firstPost.message); // pushed back as received, reasoning included
    expect(toolResult.role).toBe("tool");
    expect(toolResult.tool_call_id).toBe(firstPost.message.tool_calls[0].id);
    expect(toolResult.content).toMatch(/plan rejected, nothing was sent/);
    expect(result.rejectedPlans).toHaveLength(1);
    expect(result.rejectedPlans[0].plan.actions).toEqual([react("3madeupid", "🍲")]);
    expect(result.rejectedPlans[0].error).toBe(toolResult.content);
    expect(result.turns[0].toolCalls[0].outcome).toBe("plan-rejected");
  });
});

describe("runToolLoop: failures return no plan", () => {
  it("two plain-text answers fail the run", async () => {
    const { result, calls } = await runScript([textReply("hello"), textReply("hello again"), validPost()]);
    expect(result).toMatchObject({ ok: false, failureKind: "plain-text" });
    expect(result).not.toHaveProperty("plan");
    expect(calls).toHaveLength(2);
  });

  it("two rejected plans in a row fail the run", async () => {
    const { result, calls } = await runScript([rejectedPost(), rejectedPost(), validPost()]);
    expect(result).toMatchObject({ ok: false, failureKind: "rejected-plans" });
    expect(result).not.toHaveProperty("plan");
    expect(calls).toHaveLength(2); // the third, valid reply is never asked for
    expect(result.rejectedPlans).toHaveLength(2);
    expect(result.turns).toHaveLength(2);
  });

  it("arguments that are not JSON count as a rejected plan", async () => {
    const { result } = await runScript([toolCallReply("post", "{not json"), toolCallReply("post", "{still not")]);
    expect(result).toMatchObject({ ok: false, failureKind: "rejected-plans" });
    expect(result.rejectedPlans[0].plan).toBe("{not json");
  });

  it("step cap: 8 model turns without a valid post fail the run", async () => {
    const wanderingReplies = Array.from({ length: 12 }, () => toolCallReply("look_around", {}));
    const { result, calls } = await runScript(wanderingReplies);
    expect(result).toMatchObject({ ok: false, failureKind: "step-cap" });
    expect(result).not.toHaveProperty("plan");
    expect(calls).toHaveLength(8);
    expect(result.turns).toHaveLength(8);
    expect(result.tokens.total).toBe(8 * 15);
  });

  it("a model call that throws fails the run and keeps the turns so far", async () => {
    const { result } = await runScript([rejectedPost(), new Error("Model call HTTP 503: down")]);
    expect(result).toMatchObject({ ok: false, failureKind: "model-error" });
    if (result.ok) return;
    expect(result.error).toMatch(/HTTP 503/);
    expect(result.turns).toHaveLength(1);
  });
});
