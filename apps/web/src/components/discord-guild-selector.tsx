"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Guild {
  id: string;
  name: string;
  permissions: string;
}

export function DiscordGuildSelector() {
  const [guilds, setGuilds] = React.useState<Guild[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedGuild, setSelectedGuild] = React.useState<string>("");
  const [installStatus, setInstallStatus] = React.useState<
    "idle" | "loading" | "authorized" | "not-installed" | "error"
  >("idle");

  React.useEffect(() => {
    async function fetchGuilds() {
      try {
        const response = await fetch("/api/discord/guilds");
        if (!response.ok) {
          throw new Error("Failed to fetch guilds");
        }
        const data = await response.json();
        setGuilds(data.guilds || []);
      } catch (error) {
        console.error(error);
        toast.error("Could not load your Discord servers");
      } finally {
        setLoading(false);
      }
    }

    fetchGuilds();
  }, []);

  React.useEffect(() => {
    if (!selectedGuild) {
      setInstallStatus("idle");
      return;
    }

    const controller = new AbortController();

    async function checkInstall() {
      setInstallStatus("loading");
      try {
        const response = await fetch(
          `/api/discord/guilds/${selectedGuild}/installed`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("Failed to check bot status");
        }
        const data = await response.json();
        setInstallStatus(data.installed ? "authorized" : "not-installed");
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        console.error(error);
        setInstallStatus("error");
        toast.error("Could not check bot installation");
      }
    }

    checkInstall();

    return () => controller.abort();
  }, [selectedGuild]);

  if (loading) {
    return (
      <div className="grid gap-2">
        <div className="h-4 w-24 bg-muted animate-pulse rounded" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label
        htmlFor="select-server"
        className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
      >
        Select Server
      </label>
      <Select
        value={selectedGuild}
        onValueChange={setSelectedGuild}
        disabled={guilds.length === 0}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              guilds.length === 0
                ? "No eligible servers found"
                : "Select a server..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Your Admin Servers</SelectLabel>
            {guilds.map((guild) => (
              <SelectItem key={guild.id} value={guild.id}>
                {guild.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {guilds.length === 0 && (
        <p className="text-xs text-muted-foreground">
          You need to be an Administrator or have "Manage Guild" permissions to
          select a server.
        </p>
      )}
      {selectedGuild && installStatus !== "idle" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="uppercase tracking-[0.2em] text-muted-foreground">
            Bot
          </span>
          {installStatus === "loading" && (
            <span className="text-muted-foreground">Checking...</span>
          )}
          {installStatus === "authorized" && (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600"
            >
              Authorized
            </Badge>
          )}
          {installStatus === "not-installed" && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-600"
            >
              Not installed
            </Badge>
          )}
          {installStatus === "error" && (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive"
            >
              Check failed
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
