// Log in to Bluesky and get a client that talks to the chat service.
import { AtpAgent } from "@atproto/api";
import { readRequiredEnv } from "../config.ts";

const BLUESKY_SERVICE_URL = "https://bsky.social";
// Chat lives on its own service; the proxy header routes calls there through the PDS.
const CHAT_SERVICE_DID = "did:web:api.bsky.chat";

const AUTH_ERROR_NAMES = ["ExpiredToken", "InvalidToken", "AuthenticationRequired", "AuthMissing"];

async function logIn(agent: AtpAgent) {
  await agent.login({
    identifier: readRequiredEnv("BLUESKY_HANDLE"),
    password: readRequiredEnv("BLUESKY_APP_PASSWORD"),
  });
}

export async function createSession() {
  const agent = new AtpAgent({ service: BLUESKY_SERVICE_URL });
  await logIn(agent);
  // The proxied clone shares the agent's session, so a fresh login covers both.
  const chatAgent = agent.withProxy("bsky_chat", CHAT_SERVICE_DID);
  return {
    agent,
    chatAgent,
    homerDid: agent.session!.did,
    homerHandle: agent.session!.handle,
  };
}

export type Session = Awaited<ReturnType<typeof createSession>>;

export function isAuthError(error: any): boolean {
  return error?.status === 401 || AUTH_ERROR_NAMES.includes(error?.error);
}

// Run a Bluesky call; on an auth error, log in again and retry it once.
export async function withSessionRetry<Result>(
  session: Session,
  makeCall: () => Promise<Result>,
): Promise<Result> {
  try {
    return await makeCall();
  } catch (error) {
    if (!isAuthError(error)) throw error;
    console.warn("bluesky auth error; logging in again and retrying once");
    await logIn(session.agent);
    return await makeCall();
  }
}
