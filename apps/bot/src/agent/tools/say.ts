import { tool } from "ai";
import { z } from "zod";
import type { AgentAction } from "../agent";

export function createSayTool(actions: AgentAction[]) {
  return tool({
    description: "Speak a short message aloud in the guild voice channel.",
    inputSchema: z.object({
      text: z.string(),
      voice: z.string().min(1).optional(),
    }),
    execute: async ({ text, voice }) => {
      actions.push({
        type: "say",
        text,
        voice: voice?.trim() || undefined,
      });
      return { ok: true };
    },
  });
}
