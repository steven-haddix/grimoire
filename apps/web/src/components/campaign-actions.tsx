"use client";

import { Button } from "@/components/ui/button";
import { setActiveCampaign, deleteCampaign } from "@/app/actions/campaigns";
import { toast } from "sonner";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Play, MoreVertical, Edit2, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";

export function CampaignActions({ 
  campaignId, 
  guildId, 
  isActive 
}: { 
  campaignId: number, 
  guildId: string,
  isActive: boolean 
}) {
  const [loading, setLoading] = useState(false);

  async function onSetActive() {
    if (isActive) return;
    setLoading(true);
    try {
      await setActiveCampaign(campaignId, guildId);
      toast.success("Active campaign updated");
    } catch (error) {
      toast.error("Failed to update active campaign");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("Are you sure you want to delete this campaign? This cannot be undone.")) return;
    setLoading(true);
    try {
      await deleteCampaign(campaignId, guildId);
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error("Failed to delete campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10">
          <MoreVertical className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-card border-border/60">
        {!isActive && (
          <DropdownMenuItem onClick={onSetActive} disabled={loading} className="gap-2 focus:bg-primary/10 focus:text-primary">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Play className="h-4 w-4 text-primary" />
            )}
            Set as Active
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem className="gap-2 opacity-50 cursor-not-allowed">
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
  );
}

