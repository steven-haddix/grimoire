import { isTextUIPart, type UIMessage } from "ai";

/**
 * Pure helpers for the web "Ask Grimoire" chat: converting persisted
 * `web_chat_messages` rows to UIMessages and back. Kept free of DB/agent
 * imports so they stay unit-testable.
 */

/** How many persisted messages the chat page loads into the conversation. */
export const WEB_CHAT_HISTORY_LIMIT = 50;

/** How many trailing messages are sent to the model as context. */
export const WEB_CHAT_CONTEXT_LIMIT = 20;

/** Max characters accepted for a single user message. */
export const WEB_CHAT_INPUT_MAX_CHARS = 2000;

export type WebChatRole = "user" | "assistant";

export type WebChatMessageRow = {
  id: number;
  role: string;
  content: string;
};

/** Convert persisted rows (oldest first) into UIMessages for useChat. */
export function rowsToUIMessages(rows: WebChatMessageRow[]): UIMessage[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: `db-${row.id}`,
      role: row.role as WebChatRole,
      parts: [{ type: "text" as const, text: row.content }],
    }));
}

/** Concatenated text content of a UIMessage's text parts. */
export function extractMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => isTextUIPart(part))
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}
