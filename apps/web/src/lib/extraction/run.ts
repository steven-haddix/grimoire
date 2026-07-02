import { generateText, Output } from "ai";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import type { EntityType } from "@/db/schema";
import {
  campaigns,
  entities,
  entityAliases,
  entityFacts,
  extractionRuns,
  players,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import {
  CLAUDE_MODEL_ID,
  claudeModel,
  claudeProviderOptions,
  resolveClaudeEffort,
} from "@/lib/agents/claude";
import { selectCandidates } from "./candidates";
import { loadCampaignGraph } from "./graph";
import { indexEntities } from "./indexing";
import {
  buildExtractionPrompt,
  type ExtractionOutput,
  extractionInstructions,
  extractionOutputSchema,
  type PlayerContext,
  PROMPT_VERSION,
} from "./output-schema";
import { reconcile } from "./reconciler";
import type { EntityObservation } from "./types";

// Entity extraction runs in the background after summarize, so reasoning
// depth costs nothing user-visible; override per env.
const EXTRACTION_EFFORT = resolveClaudeEffort(
  process.env.EXTRACTION_EFFORT,
  "high",
);

/**
 * Session-end entity extraction: one LLM pass proposes entity observations,
 * the deterministic reconciler turns them into graph writes. Idempotent — a
 * re-run first drops this session's previous extractor-sourced facts/aliases,
 * and entity creation dedupes by name through the reconciler. Best-effort:
 * never throws, so it can't break the summarize request that triggers it.
 * Every attempt (including failures) is recorded in extraction_runs.
 */
export async function runExtraction(sessionId: number): Promise<void> {
  let runId: number | null = null;
  try {
    const [session] = await db
      .select({ id: sessions.id, campaignId: sessions.campaignId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session?.campaignId) return;
    const campaignId = session.campaignId;

    const lines = await db
      .select({
        speaker: transcripts.speaker,
        speakerDiscordUserId: transcripts.speakerDiscordUserId,
        content: transcripts.content,
      })
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .orderBy(asc(transcripts.timestamp));

    if (!lines.length) return;

    // Deterministic bookkeeping, not extraction: every speaker with a stable
    // Discord id becomes/updates a player row for this campaign.
    await upsertPlayers(campaignId, sessionId);

    // Idempotency: drop what this session's previous extraction wrote before
    // reading the graph, so re-runs reconcile against pre-session state and
    // no-op fact dedup behaves the same every time.
    await db
      .delete(entityFacts)
      .where(
        and(
          eq(entityFacts.sourceSessionId, sessionId),
          eq(entityFacts.source, "extractor"),
        ),
      );
    await db
      .delete(entityAliases)
      .where(eq(entityAliases.sourceSessionId, sessionId));

    const [campaign] = await db
      .select({ name: campaigns.name, description: campaigns.description })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const [summaryRow] = await db
      .select({ text: summaries.text })
      .from(summaries)
      .where(eq(summaries.sessionId, sessionId))
      .orderBy(desc(summaries.createdAt))
      .limit(1);

    const graph = await loadCampaignGraph(campaignId);
    const playerContext = await loadPlayerContext(campaignId);

    const transcript = lines
      .map((line) => `${line.speaker}: ${line.content}`)
      .join("\n");
    const summary = summaryRow?.text ?? null;

    const candidates = selectCandidates(
      graph,
      `${summary ?? ""}\n${transcript}`,
    );

    const [run] = await db
      .insert(extractionRuns)
      .values({
        sessionId,
        campaignId,
        promptVersion: PROMPT_VERSION,
        model: CLAUDE_MODEL_ID,
        status: "pending",
      })
      .returning();
    runId = run?.id ?? null;

    const prompt = buildExtractionPrompt({
      campaignName: campaign?.name ?? null,
      campaignDescription: campaign?.description ?? null,
      players: playerContext,
      candidates,
      summary,
      transcript,
    });

    const result = await generateText({
      model: claudeModel,
      instructions: extractionInstructions,
      prompt,
      output: Output.object({ schema: extractionOutputSchema }),
      runtimeContext: { sessionId, campaignId },
      telemetry: {
        isEnabled: true,
        functionId: "extract-entities",
        includeRuntimeContext: { sessionId: true, campaignId: true },
      },
      providerOptions: claudeProviderOptions(EXTRACTION_EFFORT),
    });

    const output = result.output;
    const observations = toObservations(output);

    // The model judged identity against candidates, but reconciliation runs
    // against the FULL graph so name fallbacks, tombstones, and redirects
    // consider entities the candidate filter left out.
    const plan = reconcile(graph, observations);

    const affectedIds: number[] = [];
    await db.transaction(async (tx) => {
      for (const planned of plan.newEntities) {
        const [created] = await tx
          .insert(entities)
          .values({
            campaignId,
            type: planned.type,
            name: planned.name,
            lastSeenSessionId: planned.appearedInSession ? sessionId : null,
          })
          .returning();
        if (!created) continue;
        affectedIds.push(created.id);

        if (planned.aliases.length) {
          await tx
            .insert(entityAliases)
            .values(
              planned.aliases.map((alias) => ({
                entityId: created.id,
                alias,
                sourceSessionId: sessionId,
              })),
            )
            .onConflictDoNothing();
        }
        if (planned.facts.length) {
          await tx.insert(entityFacts).values(
            planned.facts.map((fact) => ({
              entityId: created.id,
              key: fact.key,
              value: fact.value,
              confidence: fact.confidence,
              source: "extractor" as const,
              sourceSessionId: sessionId,
            })),
          );
        }
      }

      for (const update of plan.entityUpdates) {
        affectedIds.push(update.entityId);

        if (update.newAliases.length) {
          await tx
            .insert(entityAliases)
            .values(
              update.newAliases.map((alias) => ({
                entityId: update.entityId,
                alias,
                sourceSessionId: sessionId,
              })),
            )
            .onConflictDoNothing();
        }
        if (update.newFacts.length) {
          await tx.insert(entityFacts).values(
            update.newFacts.map((fact) => ({
              entityId: update.entityId,
              key: fact.key,
              value: fact.value,
              confidence: fact.confidence,
              source: "extractor" as const,
              sourceSessionId: sessionId,
            })),
          );
        }
        if (update.markSeen) {
          // Monotonic: only move last-seen forward, so out-of-order backfill
          // runs can't rewind it.
          await tx
            .update(entities)
            .set({ lastSeenSessionId: sessionId })
            .where(
              and(
                eq(entities.id, update.entityId),
                or(
                  isNull(entities.lastSeenSessionId),
                  lt(entities.lastSeenSessionId, sessionId),
                ),
              ),
            );
        }
      }

      if (runId != null) {
        await tx
          .update(extractionRuns)
          .set({
            status: "succeeded",
            rawOutput: output,
            completedAt: new Date(),
          })
          .where(eq(extractionRuns.id, runId));
      }
    });

    await indexEntities(campaignId, affectedIds);
  } catch (error) {
    console.error("runExtraction failed", { sessionId, error });
    if (runId != null) {
      await db
        .update(extractionRuns)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        })
        .where(eq(extractionRuns.id, runId))
        .catch((updateError) => {
          console.error("failed to record extraction failure", {
            sessionId,
            updateError,
          });
        });
    }
  }
}

/** Map the zod-validated LLM output onto the reconciler's observation type. */
function toObservations(output: ExtractionOutput): EntityObservation[] {
  return output.entities.map((entity) => ({
    name: entity.name,
    type: entity.type as EntityType,
    matchedEntityId: entity.matchedEntityId ?? null,
    aliases: entity.aliases ?? undefined,
    facts:
      entity.facts?.map((fact) => ({
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence ?? null,
      })) ?? undefined,
    appearedInSession: entity.appearedInSession ?? undefined,
  }));
}

/**
 * Upsert player rows from this session's transcript speakers. Only speakers
 * with a Discord user id qualify — display names alone are not identity.
 */
async function upsertPlayers(
  campaignId: number,
  sessionId: number,
): Promise<void> {
  const speakerRows = await db
    .selectDistinct({
      discordUserId: transcripts.speakerDiscordUserId,
      displayName: transcripts.speaker,
    })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.sessionId, sessionId),
        isNotNull(transcripts.speakerDiscordUserId),
      ),
    );

  // A user may appear under several display names in one session; keep the
  // last one seen.
  const byUser = new Map<string, string>();
  for (const row of speakerRows) {
    if (row.discordUserId) byUser.set(row.discordUserId, row.displayName);
  }
  if (!byUser.size) return;

  await db
    .insert(players)
    .values(
      [...byUser.entries()].map(([discordUserId, displayName]) => ({
        campaignId,
        discordUserId,
        displayName,
      })),
    )
    .onConflictDoUpdate({
      target: [players.campaignId, players.discordUserId],
      set: { displayName: sql`excluded.display_name` },
    });
}

async function loadPlayerContext(campaignId: number): Promise<PlayerContext[]> {
  const playerRows = await db
    .select({ id: players.id, displayName: players.displayName })
    .from(players)
    .where(eq(players.campaignId, campaignId));

  if (!playerRows.length) return [];

  const pcRows = await db
    .select({ playerId: entities.playerId, name: entities.name })
    .from(entities)
    .where(
      and(
        eq(entities.campaignId, campaignId),
        eq(entities.type, "pc"),
        isNotNull(entities.playerId),
        isNull(entities.suppressedAt),
      ),
    );

  const pcsByPlayer = new Map<number, string[]>();
  for (const pc of pcRows) {
    if (pc.playerId == null) continue;
    const list = pcsByPlayer.get(pc.playerId) ?? [];
    list.push(pc.name);
    pcsByPlayer.set(pc.playerId, list);
  }

  return playerRows.map((player) => ({
    displayName: player.displayName,
    characterNames: pcsByPlayer.get(player.id) ?? [],
  }));
}
