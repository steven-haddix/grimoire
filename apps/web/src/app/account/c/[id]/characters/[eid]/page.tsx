import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import type { EntityType } from "@/db/schema";
import {
  campaigns,
  entities,
  entityAliases,
  entityFacts,
  players,
  sessions,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { EntityDetail, type FactRow } from "./entity-detail";

interface EntityPageProps {
  params: Promise<{ id: string; eid: string }>;
}

export default async function EntityPage(props: EntityPageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);
  const entityId = parseInt(params.eid, 10);
  if (Number.isNaN(campaignId) || Number.isNaN(entityId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) notFound();

  const entity = await db.query.entities.findFirst({
    where: and(eq(entities.id, entityId), eq(entities.campaignId, campaignId)),
  });
  if (!entity) notFound();

  const [aliasRows, factRows, campaignPlayers, mergeTargets, mergedInto] =
    await Promise.all([
      db
        .select({ alias: entityAliases.alias })
        .from(entityAliases)
        .where(eq(entityAliases.entityId, entityId)),
      db
        .select()
        .from(entityFacts)
        .where(eq(entityFacts.entityId, entityId))
        .orderBy(desc(entityFacts.id)),
      db
        .select({ id: players.id, displayName: players.displayName })
        .from(players)
        .where(eq(players.campaignId, campaignId)),
      db
        .select({
          id: entities.id,
          name: entities.name,
          type: entities.type,
        })
        .from(entities)
        .where(
          and(
            eq(entities.campaignId, campaignId),
            isNull(entities.suppressedAt),
            isNull(entities.mergedIntoEntityId),
          ),
        ),
      entity.mergedIntoEntityId != null
        ? db.query.entities.findFirst({
            where: eq(entities.id, entity.mergedIntoEntityId),
          })
        : Promise.resolve(null),
    ]);

  // Map fact source sessions to dates for the history view.
  const factSessionIds = [
    ...new Set(
      factRows
        .map((f) => f.sourceSessionId)
        .filter((id): id is number => id != null),
    ),
  ];
  const factSessions = factSessionIds.length
    ? await db
        .select({ id: sessions.id, startedAt: sessions.startedAt })
        .from(sessions)
        .where(inArray(sessions.id, factSessionIds))
    : [];
  const sessionDates = new Map(
    factSessions.map((s) => [s.id, s.startedAt?.toISOString() ?? null]),
  );

  const facts: FactRow[] = factRows.map((f) => ({
    id: f.id,
    key: f.key,
    value: f.value,
    source: f.source,
    confidence: f.confidence,
    sessionDate:
      f.sourceSessionId != null
        ? (sessionDates.get(f.sourceSessionId) ?? null)
        : null,
    createdAt: f.createdAt.toISOString(),
  }));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: campaign.name, href: `/account/c/${campaign.id}` },
          {
            label: "Characters",
            href: `/account/c/${campaign.id}/characters`,
          },
          { label: entity.name },
        ]}
      />
      <div className="page" style={{ maxWidth: 920 }}>
        <EntityDetail
          campaignId={campaignId}
          entity={{
            id: entity.id,
            type: entity.type as EntityType,
            name: entity.name,
            playerId: entity.playerId,
            suppressed: entity.suppressedAt != null,
            mergedInto: mergedInto
              ? { id: mergedInto.id, name: mergedInto.name }
              : null,
          }}
          aliases={aliasRows.map((a) => a.alias)}
          facts={facts}
          players={campaignPlayers}
          mergeTargets={mergeTargets.filter((t) => t.id !== entityId)}
        />
      </div>
    </>
  );
}
