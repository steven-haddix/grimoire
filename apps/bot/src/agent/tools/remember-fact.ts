import type { RuntimeDb } from "@grimoire/data/client";
import { rememberFact } from "@grimoire/data/repos/memories";
import { MEMORY_CATEGORIES } from "@grimoire/data/types";
import { tool } from "ai";
import { z } from "zod";

export function createRememberFactTool(params: {
  db: RuntimeDb;
  activeCampaignId: number | null;
  defaultSource: string;
}) {
  const { db, activeCampaignId, defaultSource } = params;

  return tool({
    description:
      "Store an important fact to remember for this campaign. Use for lore, character details, rules, or anything worth preserving.",
    inputSchema: z.object({
      content: z.string().min(1).describe("The fact to remember"),
      category: z
        .enum(MEMORY_CATEGORIES)
        .describe(
          "Category: 'character' for PCs/NPCs, 'lore' for world/places, 'rule' for house rules, 'meta' for scheduling/preferences, 'other' for misc",
        ),
      source: z
        .string()
        .optional()
        .describe("Who provided this information (defaults to message sender)"),
    }),
    execute: async ({ content, category, source }) => {
      if (!activeCampaignId) {
        return {
          ok: false,
          error:
            "No active campaign. Cannot store memories without a campaign.",
        };
      }

      await rememberFact(db, {
        campaignId: activeCampaignId,
        content: content.trim(),
        category,
        source: source?.trim() || defaultSource,
      });

      return { ok: true };
    },
  });
}
