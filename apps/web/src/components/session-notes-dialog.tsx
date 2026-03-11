"use client";

import { format } from "date-fns";
import { FileText, NotebookPen, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addSessionNotes } from "@/app/actions/sessions";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type SessionNote = {
  id: number;
  content: string;
  source: string;
  createdByName: string;
  createdAt: Date;
};

interface SessionNotesDialogProps {
  sessionId: number;
  sessionStatus: string;
  notes: SessionNote[];
}

export function SessionNotesDialog({
  sessionId,
  sessionStatus,
  notes,
}: SessionNotesDialogProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    formData.append("sessionId", sessionId.toString());

    try {
      const result = await addSessionNotes(formData);
      toast.success(
        result.summaryUpdated
          ? "Notes saved and session summary refreshed"
          : "Notes saved for this session",
      );
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save notes",
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <NotebookPen className="h-4 w-4" />
          {notes.length > 0 ? `Notes (${notes.length})` : "Add Notes"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Session Notes</DialogTitle>
          <DialogDescription>
            Add extra color from GM notes, missed scenes, or post-session
            writeups.
            {sessionStatus === "active"
              ? " These notes will be picked up when the live session recap is generated."
              : " Saving new notes will also generate an updated recap."}
          </DialogDescription>
        </DialogHeader>

        {notes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              Existing Notes
            </div>
            <ScrollArea className="h-52 rounded-md border border-border/60 bg-muted/20 p-4">
              <div className="space-y-4 pr-4">
                {notes.map((note) => (
                  <div key={note.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {note.source}
                      </span>
                      <span>by {note.createdByName}</span>
                      <span>•</span>
                      <span>{format(note.createdAt, "PPP p")}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">
                      {note.content}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor={`notes-${sessionId}`}
              className="text-sm font-medium"
            >
              Paste notes
            </label>
            <Textarea
              id={`notes-${sessionId}`}
              name="notes"
              placeholder="Add any missed moments, clarifications, NPC names, loot corrections, or vibes worth preserving."
              className="min-h-[180px] resize-y"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`noteFiles-${sessionId}`}
              className="text-sm font-medium"
            >
              Upload text files
            </label>
            <Input
              id={`noteFiles-${sessionId}`}
              name="noteFiles"
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json"
              multiple
            />
            <p className="text-xs text-muted-foreground">
              Supports plain text, markdown, csv, json, or log files up to 300
              KB each.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="gap-2">
              <Upload className="h-4 w-4" />
              {loading ? "Saving..." : "Save Notes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
