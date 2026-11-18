// A fake SendContext for tests: no network, nothing real is ever sent. Lives next to send.ts on purpose:
// it must name the chat write calls to fake them, and the Sender grep skips `bluesky/send.ts*`.
// Tests outside this folder read `sentMessages()` instead of naming the write call.
import { expect, vi } from "vitest";
import type { SendContext } from "./send.ts";

export function makeFakeSendContext(paused = false) {
  const fakeState: any = { paused, lastAlertDate: null };
  const sendMessage = vi.fn(async (_request: any) => ({ data: { id: "newMessage1" } }));
  const addReactionCall = vi.fn(async (_request: any) => ({ data: { message: { id: "target1" } } }));
  const readState = vi.fn(async () => ({ ...fakeState }));
  const updateState = vi.fn(async (changeState: (state: any) => void) => changeState(fakeState));
  const session = { chatAgent: { chat: { bsky: { convo: { sendMessage, addReaction: addReactionCall } } } } };
  const context: SendContext = { session, readState, updateState };
  const sentMessages = () => sendMessage.mock.calls.map((call) => call[0]);
  const expectNothingSent = () => {
    expect(sendMessage).not.toHaveBeenCalled();
    expect(addReactionCall).not.toHaveBeenCalled();
  };
  return { context, fakeState, sendMessage, addReactionCall, readState, updateState, sentMessages, expectNothingSent };
}
