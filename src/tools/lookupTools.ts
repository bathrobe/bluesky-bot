// The lookup tools a run offers the model, built once the run has a session and its target
// conversation. All only read. The tool loop caps them at config.caps.lookupsPerRun, shared.
import type { LookupTools } from "../llm/toolLoop.ts";
import { createBlueskyUserPostsTool } from "./blueskyUserPosts.ts";
import { createReadLinkTool } from "./readLink.ts";
import { createSearchBlueskyTool } from "./searchBluesky.ts";
import { createSearchChatTool } from "./searchChat.ts";

export type LookupToolsContext = { session: any; convoId: string; shortHandleByDid: Record<string, string>; messages?: any[] };

export function createLookupTools(context: LookupToolsContext): LookupTools {
  return {
    search_chat: createSearchChatTool(context), // throws unless convoId is on the allow list
    search_bluesky: createSearchBlueskyTool(context.session),
    bluesky_user_posts: createBlueskyUserPostsTool(context), // members only when they are in the run's transcript
    read_link: createReadLinkTool(context), // the url comes from a transcript message, never from the model
  };
}
