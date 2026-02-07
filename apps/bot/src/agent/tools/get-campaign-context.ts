import type { RuntimeDb } from "@grimoire/data/client";
import { loadCampaignContext } from "@grimoire/data/repos/campaigns";
import { tool } from "ai";
import { z } from "zod";

export function createGetCampaignContextTool(db: RuntimeDb, guildId: string) {
  return tool({
    description:
      "Fetch the active campaign details, session history with summaries, and recent transcripts for this guild.",
    inputSchema: z.object({
      sessionLimit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of recent sessions to include (default 5)"),
    }),
    execute: async ({ sessionLimit }) => {
      return loadCampaignContext(db, {
        guildId,
        sessionLimit,
      });
    },
  });
}
