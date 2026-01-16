"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface Guild {
  id: string
  name: string
  permissions: string
}

export function DiscordGuildSelector() {
  const [guilds, setGuilds] = React.useState<Guild[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedGuild, setSelectedGuild] = React.useState<string>("")

  React.useEffect(() => {
    async function fetchGuilds() {
      try {
        const response = await fetch("/api/discord/guilds")
        if (!response.ok) {
           throw new Error("Failed to fetch guilds")
        }
        const data = await response.json()
        setGuilds(data.guilds || [])
      } catch (error) {
        console.error(error)
        toast.error("Could not load your Discord servers")
      } finally {
        setLoading(false)
      }
    }

    fetchGuilds()
  }, [])

  if (loading) {
    return (
      <div className="grid gap-2">
         <div className="h-4 w-24 bg-muted animate-pulse rounded" />
         <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Select Server
      </label>
      <Select value={selectedGuild} onValueChange={setSelectedGuild} disabled={guilds.length === 0}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={guilds.length === 0 ? "No eligible servers found" : "Select a server..."} />
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
          You need to be an Administrator or have "Manage Guild" permissions to select a server.
        </p>
      )}
    </div>
  )
}
