// Shared guard for chat spikes: the test DM is the only conversation they may touch.
import { TEST_DM_CONVO_ID } from "../../src/config.ts";

export function requireTestDm(convoId: string): string {
  if (convoId !== TEST_DM_CONVO_ID) {
    throw new Error(`Refusing conversation ${convoId}: spikes only touch the test DM ${TEST_DM_CONVO_ID}`);
  }
  return convoId;
}

// The only way spikes get a conversation ID: from config, checked.
export const testDmConvoId = requireTestDm(TEST_DM_CONVO_ID);
