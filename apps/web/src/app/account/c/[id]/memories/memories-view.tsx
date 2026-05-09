"use client";

import { format } from "date-fns";
import * as React from "react";
import { toast } from "sonner";
import { createMemory, deleteMemory } from "@/app/actions/memories";
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
import { stripInlineMarkdown } from "@/lib/text/derive";

type Memory = {
  id: number;
  campaignId: number;
  content: string;
  category: string;
  source: string | null;
  createdAt: Date;
};

const CATEGORIES = ["all", "lore", "character", "rule", "meta", "other"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

function memoryVariant(category: string) {
  if (["lore", "character", "rule", "meta"].includes(category)) {
    return category as "lore" | "character" | "rule" | "meta";
  }
  return "other" as const;
}

function memoryTitle(content: string): string {
  const trimmed = stripInlineMarkdown(content.trim());
  const period = trimmed.indexOf(".");
  const newline = trimmed.indexOf("\n");
  const breakAt =
    period > 12 && (newline === -1 || period < newline)
      ? period
      : newline > 0
        ? newline
        : -1;
  if (breakAt > 0 && breakAt < 100) {
    return trimmed.slice(0, breakAt + (period === breakAt ? 1 : 0));
  }
  return trimmed.length > 100 ? `${trimmed.slice(0, 100)}…` : trimmed;
}

function memoryBody(content: string): string | null {
  const trimmed = stripInlineMarkdown(content.trim());
  const title = memoryTitle(content);
  if (trimmed === title) return null;
  return trimmed.slice(title.length).trim();
}

export function MemoriesView({
  memories,
  campaignId,
  campaignName,
}: {
  memories: Memory[];
  campaignId: number;
  campaignName: string;
}) {
  const [filter, setFilter] = React.useState<CategoryFilter>("all");
  const [search, setSearch] = React.useState("");

  const counts: Record<CategoryFilter, number> = {
    all: memories.length,
    lore: 0,
    character: 0,
    rule: 0,
    meta: 0,
    other: 0,
  };
  for (const m of memories) {
    const k = (CATEGORIES as readonly string[]).includes(m.category)
      ? (m.category as CategoryFilter)
      : "other";
    counts[k] += 1;
  }

  const filtered = memories.filter((m) => {
    const matchesCategory = filter === "all" || m.category === filter;
    if (!matchesCategory) return false;
    if (!search.trim()) return true;
    return m.content.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div className="t-eyebrow">{campaignName} · the campaign brain</div>
          <h1 className="t-display" style={{ fontSize: 56, marginTop: 8 }}>
            What Grimoire <em>remembers</em>
          </h1>
        </div>
        <AddMemoryDialog campaignId={campaignId} />
      </div>
      <p
        style={{
          color: "var(--bone-dim)",
          maxWidth: 600,
          marginBottom: 30,
          fontSize: 15,
        }}
      >
        Long-lived facts the agent draws on whenever someone @-mentions it
        in chat or voice. Auto-extracted from sessions and editable by hand.
      </p>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c}
            className={`tab ${filter === c ? "tab--active" : ""}`}
            onClick={() => setFilter(c)}
          >
            {c === "all" ? "All" : c} <small>{counts[c] ?? 0}</small>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 24, maxWidth: 360 }}>
        <div className="search">
          <Diamond size={6} />
          <input
            placeholder="Search memories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            border: "0.5px dashed var(--rule)",
            padding: "60px 32px",
            textAlign: "center",
            background: "var(--ink-2)",
            color: "var(--bone-mute)",
          }}
        >
          <h3 className="t-display" style={{ fontSize: 24, marginBottom: 8 }}>
            {search.trim() ? "No matches" : "No memories yet"}
          </h3>
          <p className="t-meta" style={{ maxWidth: 420, margin: "0 auto" }}>
            {search.trim()
              ? "Try a broader search or different category."
              : "When sessions run, the agent extracts long-lived facts here. You can also add them by hand."}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {filtered.map((m) => {
            const title = memoryTitle(m.content);
            const body = memoryBody(m.content);
            return (
              <div key={m.id} className="mem">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <span className="mem__title">{title}</span>
                  <Badge variant={memoryVariant(m.category)}>
                    {m.category}
                  </Badge>
                </div>
                {body ? <div className="mem__body">{body}</div> : null}
                <div className="mem__foot">
                  <span className="t-meta">
                    {format(m.createdAt, "MMM d, yyyy")}
                    {m.source ? ` · ${m.source}` : ""}
                  </span>
                  <DeleteMemoryButton
                    memoryId={m.id}
                    campaignId={campaignId}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function AddMemoryDialog({ campaignId }: { campaignId: number }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Diamond size={5} /> Add memory
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[0.5px] border-rule bg-ink-2">
        <DialogHeader>
          <DialogTitle className="t-display" style={{ fontSize: 28 }}>
            New memory
          </DialogTitle>
          <DialogDescription className="t-meta">
            A long-lived fact for the agent to keep in mind.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              try {
                await createMemory(formData);
                toast.success("Memory added");
                formRef.current?.reset();
                setOpen(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Failed to add memory",
                );
              }
            })
          }
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="memory-category" className="t-eyebrow">
              Category
            </Label>
            <Select name="category" defaultValue="lore">
              <SelectTrigger id="memory-category">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lore">lore</SelectItem>
                <SelectItem value="character">character</SelectItem>
                <SelectItem value="rule">rule</SelectItem>
                <SelectItem value="meta">meta</SelectItem>
                <SelectItem value="other">other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="memory-content" className="t-eyebrow">
              Content
            </Label>
            <Textarea
              id="memory-content"
              name="content"
              required
              rows={5}
              placeholder="A standing rule, a recurring NPC, a piece of in-world lore…"
              className="bg-ink border-[0.5px] border-rule font-sans text-bone resize-y"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label htmlFor="memory-source" className="t-eyebrow">
              Source (optional)
            </Label>
            <Input
              id="memory-source"
              name="source"
              placeholder="session 14, GM note, …"
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
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Add memory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMemoryButton({
  memoryId,
  campaignId,
}: {
  memoryId: number;
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
      }}
      disabled={pending}
      onClick={() => {
        if (!confirm("Forget this memory?")) return;
        startTransition(async () => {
          try {
            await deleteMemory(memoryId, campaignId);
            toast.success("Memory forgotten");
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete memory",
            );
          }
        });
      }}
    >
      {pending ? "…" : "forget"}
    </button>
  );
}
