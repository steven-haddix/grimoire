"use client";

import { Edit2, Eye, Loader2, MoreVertical, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCampaign, setActiveCampaign } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditCampaignDialog } from "./edit-campaign-dialog";

export function CampaignActions({
  campaign,
  guildId,
  isActive,
}: {
  campaign: { id: number; name: string; description: string | null };
  guildId: string;
  isActive: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function onSetActive() {
    if (isActive) return;
    setLoading(true);
    try {
      await setActiveCampaign(campaign.id, guildId);
      toast.success("Active campaign updated");
    } catch {
      toast.error("Failed to update active campaign");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (
      !confirm(
        "Are you sure you want to delete this campaign? This cannot be undone.",
      )
    )
      return;
    setLoading(true);
    try {
      await deleteCampaign(campaign.id, guildId);
      toast.success("Campaign deleted");
    } catch {
      toast.error("Failed to delete campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <EditCampaignDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        campaign={campaign}
        guildId={guildId}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 bg-card border-border/60"
        >
          <DropdownMenuItem asChild>
            <Link
              href={`/account/c/${campaign.id}`}
              className="gap-2 cursor-pointer w-full flex items-center"
            >
              <Eye className="h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
          {!isActive && (
            <DropdownMenuItem
              onClick={onSetActive}
              disabled={loading}
              className="gap-2 focus:bg-primary/10 focus:text-primary"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Play className="h-4 w-4 text-primary" />
              )}
              Set as Active
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setEditOpen(true);
            }}
            className="gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Edit Campaign
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-border/30" />

          <DropdownMenuItem
            onClick={onDelete}
            disabled={loading}
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete Campaign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
