import { z } from "zod";
import { ENTITY_TYPES } from "@/db/schema";
import type { GraphEntity } from "./types";

/**
 * Bump when the instructions/prompt shape changes materially. Stored on every
 * extraction_runs row so output quality regressions can be traced to prompt
 * changes.
 */
export const PROMPT_VERSION = "1";

const PREFERRED_FACT_KEYS = [
  "description",
  "status",
  "last_known_location",
  "appearance",
  "goal",
  "notes",
] as const;

export const extractionOutputSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .describe("Canonical name of the entity as heard this session"),
        type: z.enum(ENTITY_TYPES),
        matchedEntityId: z
          .number()
          .int()
          .nullish()
          .describe(
            "The id from CANDIDATE ENTITIES if this is the same entity (even under a different spelling), otherwise null",
          ),
        aliases: z
          .array(z.string())
          .nullish()
          .describe(
            "Alternate names, titles, or transcription spellings heard this session",
          ),
        facts: z
          .array(
            z.object({
              key: z
                .string()
                .min(1)
                .describe(
                  `Fact key, snake_case. Prefer: ${PREFERRED_FACT_KEYS.join(", ")}`,
                ),
              value: z.string().min(1),
              confidence: z
                .number()
                .min(0)
                .max(1)
                .nullish()
                .describe("How certain you are of this fact, 0-1"),
            }),
          )
          .nullish(),
        appearedInSession: z
          .boolean()
          .nullish()
          .describe(
            "true if the entity was present/active in the session's events; false if it was only mentioned or remembered",
          ),
      }),
    )
    .describe("Every campaign entity observed in this session"),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export const extractionInstructions = [
  "You extract campaign-world entities from a tabletop RPG (D&D-style) session transcript.",
  "Entities are: player characters (pc), non-player characters and creatures (npc), organizations/groups (faction), and places (location).",
  "",
  "IN-FICTION VS TABLE TALK — the transcript mixes in-game events with out-of-game chatter:",
  "- Extract only in-fiction entities and facts. DM narration and in-character speech are in-fiction.",
  "- Ignore rules discussions, dice talk, scheduling, food orders, jokes about the real world, and references to other games or media.",
  "- The speakers are real people. Real people are NEVER entities; the characters they play are. Never extract a speaker's real name or username as an entity.",
  "",
  "MATCHING — CANDIDATE ENTITIES lists already-known entities with ids:",
  "- If an observed entity is the same as a candidate, set matchedEntityId to that id — even when the name is spelled differently. Voice transcription regularly mangles fantasy names ('Thal Drin' may be candidate 'Thaldrin').",
  "- Only leave matchedEntityId null when the entity is genuinely new.",
  "- Record alternate names/spellings/titles heard this session in aliases.",
  "",
  "FACTS — durable, meaningful details only:",
  "- Prefer the standard keys; use last_known_location whenever an entity travels or ends the session somewhere.",
  "- Facts marked [dm] in the candidate list were curated by the game master. Only propose a different value for them when the session clearly establishes a change.",
  "- Skip generic, transient, or speculative details. No facts about dice rolls or table events.",
  "- Do not extract unnamed incidental entities ('a guard', 'some villagers') unless the session makes them significant.",
  "",
  "Set appearedInSession true only for entities present or active in the session's events, not those merely mentioned.",
].join("\n");

export type PlayerContext = {
  displayName: string;
  characterNames: string[];
};

export function buildExtractionPrompt(params: {
  campaignName: string | null;
  campaignDescription: string | null;
  players: PlayerContext[];
  candidates: GraphEntity[];
  summary: string | null;
  transcript: string;
}): string {
  const sections: string[] = [];

  if (params.campaignName) {
    sections.push(
      `CAMPAIGN: ${params.campaignName}${
        params.campaignDescription ? `\n${params.campaignDescription}` : ""
      }`,
    );
  }

  if (params.players.length) {
    sections.push(
      `PLAYERS (real people at the table — never entities):\n${params.players
        .map(
          (p) =>
            `- ${p.displayName}${
              p.characterNames.length
                ? ` plays ${p.characterNames.join(", ")}`
                : ""
            }`,
        )
        .join("\n")}`,
    );
  }

  sections.push(
    params.candidates.length
      ? `CANDIDATE ENTITIES (known entities; match by id):\n${params.candidates
          .map(formatCandidate)
          .join("\n")}`
      : "CANDIDATE ENTITIES: none known yet.",
  );

  if (params.summary) {
    sections.push(`SESSION SUMMARY:\n${params.summary}`);
  }

  sections.push(`TRANSCRIPT:\n${params.transcript}`);

  return sections.join("\n\n");
}

function formatCandidate(entity: GraphEntity): string {
  const aliases = entity.aliases.length
    ? ` (aka: ${entity.aliases.join(", ")})`
    : "";
  const facts = Object.entries(entity.facts)
    .map(([key, value]) => {
      const dmMark = entity.factSources?.[key] === "dm" ? " [dm]" : "";
      return `${key}: ${value}${dmMark}`;
    })
    .join("; ");
  return `#${entity.id} [${entity.type}] ${entity.name}${aliases}${
    facts ? ` — ${facts}` : ""
  }`;
}
