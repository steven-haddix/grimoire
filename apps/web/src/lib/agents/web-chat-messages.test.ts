import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { extractMessageText, rowsToUIMessages } from "./web-chat-messages";

describe("rowsToUIMessages", () => {
  test("converts rows to single-text-part UIMessages with stable ids", () => {
    const messages = rowsToUIMessages([
      { id: 1, role: "user", content: "Who is Skamos?" },
      { id: 2, role: "assistant", content: "A tiefling of poor judgment." },
    ]);
    expect(messages).toEqual([
      {
        id: "db-1",
        role: "user",
        parts: [{ type: "text", text: "Who is Skamos?" }],
      },
      {
        id: "db-2",
        role: "assistant",
        parts: [{ type: "text", text: "A tiefling of poor judgment." }],
      },
    ]);
  });

  test("drops rows with unknown roles", () => {
    const messages = rowsToUIMessages([
      { id: 1, role: "system", content: "should not appear" },
      { id: 2, role: "user", content: "hello" },
    ]);
    expect(messages.map((m) => m.id)).toEqual(["db-2"]);
  });

  test("returns an empty array for no rows", () => {
    expect(rowsToUIMessages([])).toEqual([]);
  });
});

describe("extractMessageText", () => {
  test("joins text parts and trims", () => {
    const message: UIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "First. " },
        { type: "text", text: "Second." },
      ],
    };
    expect(extractMessageText(message)).toBe("First. \n\nSecond.");
  });

  test("ignores non-text parts", () => {
    const message = {
      id: "m2",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-searchCampaignHistory",
          toolCallId: "t1",
          state: "output-available",
          input: { query: "innkeeper" },
          output: { ok: true },
        },
        { type: "text", text: "The innkeeper was Marta." },
      ],
    } as unknown as UIMessage;
    expect(extractMessageText(message)).toBe("The innkeeper was Marta.");
  });

  test("returns empty string when there is no text", () => {
    const message: UIMessage = { id: "m3", role: "assistant", parts: [] };
    expect(extractMessageText(message)).toBe("");
  });
});
