"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  addEntityFact,
  assignPlayer,
  mergeEntities,
  renameEntity,
  restoreEntity,
  suppressEntity,
} from "@/app/actions/entities";
import { Diamond } from "@/components/grimoire/marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EntityType } from "@/db/schema";
import { entityBadgeVariant } from "../characters-view";

export type FactRow = {
  id: number;
  key: string;
  value: string;
  source: string;
  confidence: number | null;
  sessionDate: string | null;
  createdAt: string;
};

type EntityHeader = {
  id: number;
  type: EntityType;
  name: string;
  playerId: number | null;
  suppressed: boolean;
  mergedInto: { id: number; name: string } | null;
};

type PlayerOption = { id: number; displayName: string };
type MergeTarget = { id: number; name: string; type: string };

const SUGGESTED_KEYS = [
  "description",
  "status",
  "last_known_location",
  "appearance",
  "goal",
  "notes",
] as const;

export function EntityDetail({
  campaignId,
  entity,
  aliases,
  facts,
  players,
  mergeTargets,
}: {
  campaignId: number;
  entity: EntityHeader;
  aliases: string[];
  facts: FactRow[];
  players: PlayerOption[];
  mergeTargets: MergeTarget[];
}) {
  // Latest fact per key = the current profile; everything else is history.
  const latestByKey = new Map<string, FactRow>();
  for (const fact of facts) {
    // facts arrive newest-first, so first wins
    if (!latestByKey.has(fact.key)) latestByKey.set(fact.key, fact);
  }
  const currentFacts = [...latestByKey.values()];
  const historyFacts = facts.filter((f) => latestByKey.get(f.key)?.id !== f.id);

  return (
    <>
      {entity.mergedInto ? (
        <Banner>
          This entry was merged into{" "}
          <Link
            href={`/account/c/${campaignId}/characters/${entity.mergedInto.id}`}
            style={{ color: "var(--copper)" }}
          >
            {entity.mergedInto.name}
          </Link>
          . New observations land there.
        </Banner>
      ) : null}
      {entity.suppressed ? (
        <Banner>
          This entry is suppressed — the scribe will not track it or recreate it
          from future sessions.
        </Banner>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div className="t-eyebrow">
            <Badge variant={entityBadgeVariant(entity.type)}>
              {entity.type}
            </Badge>
          </div>
          <h1 className="t-display" style={{ fontSize: 48, marginTop: 10 }}>
            {entity.name}
          </h1>
          {aliases.length ? (
            <p className="t-meta" style={{ marginTop: 6 }}>
              also known as · {aliases.join(", ")}
            </p>
          ) : null}
        </div>
        {!entity.suppressed && !entity.mergedInto ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AddFactDialog campaignId={campaignId} entityId={entity.id} />
            <RenameDialog
              campaignId={campaignId}
              entityId={entity.id}
              currentName={entity.name}
            />
            <MergeDialog
              campaignId={campaignId}
              entityId={entity.id}
              entityName={entity.name}
              targets={mergeTargets}
            />
            <SuppressButton campaignId={campaignId} entityId={entity.id} />
          </div>
        ) : entity.suppressed ? (
          <RestoreButton campaignId={campaignId} entityId={entity.id} />
        ) : null}
      </div>

      {entity.type === "pc" && !entity.suppressed && !entity.mergedInto ? (
        <PlayerAssign
          campaignId={campaignId}
          entityId={entity.id}
          playerId={entity.playerId}
          players={players}
        />
      ) : null}

      <section style={{ marginTop: 30 }}>
        <div className="t-eyebrow" style={{ marginBottom: 14 }}>
          Current record
        </div>
        {currentFacts.length === 0 ? (
          <p className="t-meta">
            Nothing recorded yet. Facts appear here after sessions, or add one
            by hand.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {currentFacts.map((fact) => (
              <FactCard key={fact.id} fact={fact} />
            ))}
          </div>
        )}
      </section>

      {historyFacts.length ? (
        <section style={{ marginTop: 36 }}>
          <div className="t-eyebrow" style={{ marginBottom: 14 }}>
            History · superseded entries
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              opacity: 0.7,
            }}
          >
            {historyFacts.map((fact) => (
              <FactCard key={fact.id} fact={fact} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "0.5px solid var(--copper-dim)",
        background: "var(--ink-2)",
        color: "var(--bone-dim)",
        padding: "10px 14px",
        marginBottom: 18,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function FactCard({ fact }: { fact: FactRow }) {
  return (
    <div className="mem" style={{ padding: "12px 16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <span className="t-eyebrow">{fact.key.replaceAll("_", " ")}</span>
        <Badge variant={fact.source === "dm" ? "lit" : "outline"}>
          {fact.source === "dm" ? "curated" : "extracted"}
        </Badge>
      </div>
      <div style={{ marginTop: 6, color: "var(--bone)", fontSize: 14 }}>
        {fact.value}
      </div>
      <div className="t-meta" style={{ marginTop: 8 }}>
        {fact.sessionDate
          ? `session of ${format(new Date(fact.sessionDate), "MMM d, yyyy")}`
          : format(new Date(fact.createdAt), "MMM d, yyyy")}
        {fact.confidence != null
          ? ` · confidence ${Math.round(fact.confidence * 100)}%`
          : ""}
      </div>
    </div>
  );
}

function PlayerAssign({
  campaignId,
  entityId,
  playerId,
  players,
}: {
  campaignId: number;
  entityId: number;
  playerId: number | null;
  players: PlayerOption[];
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 6,
      }}
    >
      <span className="t-eyebrow">Played by</span>
      <Select
        value={playerId != null ? String(playerId) : "none"}
        disabled={pending || !players.length}
        onValueChange={(value) =>
          startTransition(async () => {
            try {
              await assignPlayer(
                campaignId,
                entityId,
                value === "none" ? null : Number(value),
              );
              toast.success("Player updated");
              router.refresh();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to assign",
              );
            }
          })
        }
      >
        <SelectTrigger style={{ width: 220 }}>
          <SelectValue
            placeholder={players.length ? "Unassigned" : "No players yet"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {players.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AddFactDialog({
  campaignId,
  entityId,
}: {
  campaignId: number;
  entityId: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [key, setKey] = React.useState<string>("description");
  const formRef = React.useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Diamond size={5} /> Update record
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[0.5px] border-rule bg-ink-2">
        <DialogHeader>
          <DialogTitle className="t-display" style={{ fontSize: 28 }}>
            Update record
          </DialogTitle>
          <DialogDescription className="t-meta">
            Supersedes the current value — earlier entries stay in the history.
            The scribe treats curated facts with respect.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              try {
                await addEntityFact(formData);
                toast.success("Record updated");
                formRef.current?.reset();
                setOpen(false);
                router.refresh();
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Failed to update",
                );
              }
            })
          }
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="entityId" value={entityId} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="fact-key" className="t-eyebrow">
              Field
            </Label>
            <Select name="key" value={key} onValueChange={setKey}>
              <SelectTrigger id="fact-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUGGESTED_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="fact-value" className="t-eyebrow">
              Value
            </Label>
            <Textarea
              id="fact-value"
              name="value"
              required
              rows={4}
              placeholder="What is true now?"
              className="bg-ink border-[0.5px] border-rule font-sans text-bone resize-y"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  campaignId,
  entityId,
  currentName,
}: {
  campaignId: number;
  entityId: number;
  currentName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(currentName);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">Rename</Button>
      </DialogTrigger>
      <DialogContent className="border-[0.5px] border-rule bg-ink-2">
        <DialogHeader>
          <DialogTitle className="t-display" style={{ fontSize: 28 }}>
            Rename
          </DialogTitle>
          <DialogDescription className="t-meta">
            The old name is kept as an alias so past mentions still match.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label htmlFor="entity-name" className="t-eyebrow">
            Canonical name
          </Label>
          <Input
            id="entity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-ink border-[0.5px] border-rule font-sans text-bone"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                try {
                  await renameEntity(campaignId, entityId, name);
                  toast.success("Renamed");
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to rename",
                  );
                }
              })
            }
          >
            {pending ? "Saving…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  campaignId,
  entityId,
  entityName,
  targets,
}: {
  campaignId: number;
  entityId: number;
  entityName: string;
  targets: MergeTarget[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [targetId, setTargetId] = React.useState<string>("");
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" disabled={!targets.length}>
          Merge into…
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[0.5px] border-rule bg-ink-2">
        <DialogHeader>
          <DialogTitle className="t-display" style={{ fontSize: 28 }}>
            Merge duplicate
          </DialogTitle>
          <DialogDescription className="t-meta">
            “{entityName}” becomes an alias of the entity you pick; future
            observations land there.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label htmlFor="merge-target" className="t-eyebrow">
            Surviving entity
          </Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="merge-target">
              <SelectValue placeholder="Pick the entity to keep" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name} · {t.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending || !targetId}
            onClick={() =>
              startTransition(async () => {
                try {
                  await mergeEntities(campaignId, entityId, Number(targetId));
                  toast.success("Merged");
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to merge",
                  );
                }
              })
            }
          >
            {pending ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuppressButton({
  campaignId,
  entityId,
}: {
  campaignId: number;
  entityId: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Suppress this entry? The scribe will stop tracking it and won't recreate it. You can restore it later.",
          )
        ) {
          return;
        }
        startTransition(async () => {
          try {
            await suppressEntity(campaignId, entityId);
            toast.success("Suppressed");
            router.refresh();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to suppress",
            );
          }
        });
      }}
    >
      {pending ? "…" : "Suppress"}
    </Button>
  );
}

function RestoreButton({
  campaignId,
  entityId,
}: {
  campaignId: number;
  entityId: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <Button
      variant="primary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await restoreEntity(campaignId, entityId);
            toast.success("Restored");
            router.refresh();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to restore",
            );
          }
        })
      }
    >
      {pending ? "…" : "Restore"}
    </Button>
  );
}
