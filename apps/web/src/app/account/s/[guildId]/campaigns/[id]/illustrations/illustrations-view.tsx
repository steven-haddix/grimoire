"use client";

import { format } from "date-fns";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import {
  createIllustration,
  deleteIllustration,
} from "@/app/actions/illustrations";
import { Diamond } from "@/components/grimoire/marks";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Illustration = {
  id: number;
  caption: string | null;
  userPrompt: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sessionId: number | null;
  source: string;
  createdAt: string;
};

export function IllustrationsView({
  items,
  campaignId,
  campaignName,
  guildId,
}: {
  items: Illustration[];
  campaignId: number;
  campaignName: string;
  guildId: string;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div className="t-eyebrow">{campaignName} · the gallery</div>
          <h1 className="t-display" style={{ fontSize: 56, marginTop: 8 }}>
            <em>{items.length || "no"}</em>{" "}
            {items.length === 1 ? "moment" : "moments"}, illustrated
          </h1>
        </div>
        <CreateIllustrationDialog campaignId={campaignId}>
          <Diamond size={5} /> Conjure new scene
        </CreateIllustrationDialog>
      </div>
      <p
        style={{
          color: "var(--bone-dim)",
          maxWidth: 600,
          marginBottom: 30,
          fontSize: 15,
        }}
      >
        Generated during play, or summoned here. Each scene defaults to the
        current moment of the campaign — append a prompt to push the agent in a
        specific direction.
      </p>

      {items.length === 0 ? (
        <EmptyGallery campaignId={campaignId} />
      ) : (
        <div className="gal">
          {items.map((g) => (
            <article key={g.id} className="gal__cell" style={{ cursor: "default" }}>
              <Link
                href={`/api/illustrations/${g.id}/image`}
                target="_blank"
                rel="noreferrer"
                style={{
                  position: "relative",
                  display: "block",
                  border: "0.5px solid var(--rule)",
                  background: "var(--ink-2)",
                  aspectRatio: "4 / 5",
                  overflow: "hidden",
                }}
              >
                {/* biome-ignore lint/performance/noImgElement: served from same-origin API, not a static asset */}
                <img
                  src={`/api/illustrations/${g.id}/image`}
                  alt={g.caption ?? "Generated illustration"}
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </Link>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: 18,
                      color: "var(--bone)",
                      fontVariationSettings: '"opsz" 144',
                    }}
                  >
                    {g.caption ?? "Untitled scene"}
                  </span>
                  {g.sessionId ? (
                    <Link
                      href={`/account/s/${guildId}/sessions/${g.sessionId}`}
                      className="t-meta t-meta--lit"
                      style={{ textDecoration: "none" }}
                    >
                      S#{g.sessionId}
                    </Link>
                  ) : null}
                </div>
                <div
                  className="t-meta"
                  style={{ marginTop: 4, fontStyle: "italic" }}
                >
                  {g.userPrompt
                    ? `"${truncate(g.userPrompt, 110)}"`
                    : "auto · derived from current scene"}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    className="t-meta"
                    style={{ fontSize: 9.5, color: "var(--bone-mute)" }}
                  >
                    {format(new Date(g.createdAt), "MMM d, yyyy")} ·{" "}
                    {g.source}
                  </span>
                  <DeleteIllustrationButton
                    illustrationId={g.id}
                    campaignId={campaignId}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function EmptyGallery({ campaignId }: { campaignId: number }) {
  return (
    <div
      style={{
        border: "0.5px dashed var(--rule)",
        padding: "60px 32px",
        textAlign: "center",
        background: "var(--ink-2)",
      }}
    >
      <h2 className="t-display" style={{ fontSize: 32, marginBottom: 12 }}>
        Nothing illustrated <em>yet.</em>
      </h2>
      <p
        className="t-meta"
        style={{ maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6 }}
      >
        Conjure a scene from the campaign's current moment, or steer it with
        your own prompt. The agent will paint it in cinematic D&D style.
      </p>
      <CreateIllustrationDialog campaignId={campaignId}>
        <Diamond size={5} /> Conjure first scene
      </CreateIllustrationDialog>
    </div>
  );
}

export function CreateIllustrationDialog({
  campaignId,
  children,
  size = "default",
  variant = "primary",
}: {
  campaignId: number;
  children: React.ReactNode;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "primary" | "ghost" | "secondary" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[0.5px] border-rule bg-ink-2 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="t-display" style={{ fontSize: 28 }}>
            Conjure a scene
          </DialogTitle>
          <DialogDescription className="t-meta">
            Defaults to the current moment of the campaign. Add a prompt below
            to point the agent somewhere specific.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              try {
                const result = await createIllustration(formData);
                toast.success(
                  result.source === "live-transcript"
                    ? "Scene illustrated from tonight's table"
                    : result.source === "latest-summary"
                      ? "Scene illustrated from the most recent session"
                      : "Scene illustrated",
                );
                formRef.current?.reset();
                setOpen(false);
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Image generation failed",
                );
              }
            })
          }
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="userPrompt" className="t-eyebrow">
              Direction (optional)
            </Label>
            <Textarea
              id="userPrompt"
              name="userPrompt"
              rows={4}
              placeholder="e.g. focus on Bregga's face as she reads the letter, candle-light, close crop"
              maxLength={600}
              className="bg-ink border-[0.5px] border-rule font-sans text-bone resize-y"
            />
            <span className="t-meta" style={{ fontSize: 9.5 }}>
              Leave blank to use the current scene from the live transcript or
              the latest summary.
            </span>
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
              {pending ? "Conjuring…" : "Conjure"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteIllustrationButton({
  illustrationId,
  campaignId,
}: {
  illustrationId: number;
  campaignId: number;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      className="t-meta"
      style={{
        background: "none",
        border: 0,
        cursor: "pointer",
        color: "var(--bone-mute)",
        fontSize: 9.5,
      }}
      disabled={pending}
      onClick={() => {
        if (!confirm("Forget this illustration?")) return;
        startTransition(async () => {
          try {
            await deleteIllustration(illustrationId, campaignId);
            toast.success("Illustration removed");
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        });
      }}
    >
      {pending ? "…" : "forget"}
    </button>
  );
}
