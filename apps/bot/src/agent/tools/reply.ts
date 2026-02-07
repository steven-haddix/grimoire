import { tool } from "ai";
import { z } from "zod";
import type { AgentAction } from "../agent";

export function createReplyTool(actions: AgentAction[]) {
  return tool({
    description: "Send a text response back to the Discord user.",
    inputSchema: z.object({
      content: z.string().min(1),
    }),
    execute: async ({ content }) => {
      actions.push({
        type: "reply",
        content: content.trim(),
      });
      return { ok: true };
    },
  });
}
