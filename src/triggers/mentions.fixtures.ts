// Invented messages shaped like the real mention dump in docs/spike-notes.md > Item 4 findings.
import { makeMessage } from "../transcript.fixtures.ts";

export { HOMER_DID, JOE_DID, makeMessage } from "../transcript.fixtures.ts";
export const OTHER_DID = "did:plc:someoneelsefixture";

export function makeMentionFacet(did: string, byteStart = 0, byteEnd = 13) {
  return {
    $type: "app.bsky.richtext.facet",
    index: { byteStart, byteEnd },
    features: [{ $type: "app.bsky.richtext.facet#mention", did }],
  };
}

// "@winedark.ink hello", as the app sends it: the facet covers the 13 bytes of the handle.
export function makeMentionMessage(id: string, mentionedDid: string, fields: Record<string, any> = {}): any {
  return makeMessage({ id, text: "@winedark.ink hello", facets: [makeMentionFacet(mentionedDid)], ...fields });
}

export function makeEvent(message: any, convoId: string) {
  return { convoId, rev: message.rev ?? "rev1", message, relatedProfiles: [] };
}
