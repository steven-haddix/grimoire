"use client";

import { Button } from "@/components/ui/button";
import { setActiveCampaign } from "@/app/actions/campaigns";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { useState } from "react";

export function SetActiveButton({ campaignId, guildId }: { campaignId: number, guildId: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
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

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <Play className="mr-2 h-4 w-4" />
      Set Active
    </Button>
  );
}
