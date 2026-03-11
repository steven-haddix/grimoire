"use client";

import { Plus, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createPortalSession } from "@/app/actions/sessions";
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

interface Guild {
  id: string;
  name: string;
}

interface Campaign {
  id: number;
  name: string;
  guildId: string;
}

function formatDateTimeLocal(date: Date) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

export function CreateSessionDialog({
  guilds,
  campaigns,
}: {
  guilds: Guild[];
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string>(
    guilds[0]?.id ?? "",
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("none");
  const [status, setStatus] = useState<"active" | "completed">("completed");

  const filteredCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.guildId === selectedGuildId),
    [campaigns, selectedGuildId],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      await createPortalSession(formData);
      toast.success(
        status === "active"
          ? "Session created and marked active"
          : "Session created in the portal",
      );
      setOpen(false);
      setSelectedCampaignId("none");
      setStatus("completed");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create session",
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function onGuildChange(value: string) {
    setSelectedGuildId(value);
    const nextCampaigns = campaigns.filter(
      (campaign) => campaign.guildId === value,
    );
    if (
      !nextCampaigns.some(
        (campaign) => campaign.id.toString() === selectedCampaignId,
      )
    ) {
      setSelectedCampaignId("none");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Create Session</DialogTitle>
          <DialogDescription>
            Create a session directly in the portal. Use an active session when
            you want to keep adding notes, or a completed session when you want
            an immediate recap from uploaded notes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="guildId">Server</Label>
              <Select
                name="guildId"
                value={selectedGuildId}
                onValueChange={onGuildChange}
                required
              >
                <SelectTrigger id="guildId">
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {guilds.map((guild) => (
                    <SelectItem key={guild.id} value={guild.id}>
                      {guild.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="campaignId">Campaign</Label>
              <Select
                name="campaignId"
                value={selectedCampaignId}
                onValueChange={setSelectedCampaignId}
              >
                <SelectTrigger id="campaignId">
                  <SelectValue placeholder="Optional campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {filteredCampaigns.map((campaign) => (
                    <SelectItem
                      key={campaign.id}
                      value={campaign.id.toString()}
                    >
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={status}
                onValueChange={(value) =>
                  setStatus(value as "active" | "completed")
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="occurredAt">
                {status === "active" ? "Started at" : "When it happened"}
              </Label>
              <Input
                id="occurredAt"
                name="occurredAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocal(new Date())}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Session notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Write the session beats, NPC reveals, loot, combat highlights, and anything the recap or agent should preserve."
              className="min-h-[220px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Completed sessions with notes generate a recap
              immediately. Active sessions can be filled in later.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="noteFiles">Optional note files</Label>
            <Input
              id="noteFiles"
              name="noteFiles"
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json"
              multiple
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="gap-2">
              <ScrollText className="h-4 w-4" />
              {loading ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
