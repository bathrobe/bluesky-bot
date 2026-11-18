// The `post` tool as the model sees it: an OpenAI-style tool definition for callModel's `tools`.
// Hand-written JSON schema; it must agree with postArgumentsSchema in post.ts and with
// prompts/SYSTEM.md > "how a run works". One flat action object, since `type` picks the fields.
const messageIdDescription = "a message id copied from the transcript {id} or a search_chat result. never invent one";

export const postToolDefinition = {
  type: "function",
  function: {
    name: "post",
    description:
      "end the run with your whole plan. nothing is sent until the plan passes a check. " +
      "an empty actions list means skip.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "one line on why, for the log. nobody in chat sees it" },
        epithets: {
          type: "array",
          description: "welcome run only: the epithet you give each newcomer. leave out in every other run",
          items: {
            type: "object",
            properties: { member: { type: "string", description: "the newcomer's short name" }, epithet: { type: "string" } },
            required: ["member", "epithet"],
          },
        },
        actions: {
          type: "array",
          description: "everything you do this run, sent in order. at most 5 text + meme and 3 react",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["react", "text", "meme", "playlist_add"] },
              messageId: { type: "string", description: `react: the message to react to. playlist_add: the message with the youtube link; ${messageIdDescription}` },
              emoji: { type: "string", description: "react only: one emoji" },
              text: { type: "string", description: "text only: the message to send" },
              replyTo: { type: "string", description: `text or meme: quote-reply this message; ${messageIdDescription}` },
              file: { type: "string", description: "meme only: exact filename from the catalog" },
              caption: { type: "string", description: "meme only, optional: a short line sent with it" },
              onTheNose: {
                type: "object",
                description: "meme only, rare: send a spent meme because it is a perfect match",
                properties: { why: { type: "string" } },
                required: ["why"],
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["reason", "actions"],
    },
  },
};
