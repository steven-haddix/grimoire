import { Mic2, ScrollText, Sparkles } from "lucide-react";
import { HomeAuthControls } from "@/components/home-auth-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Live Capture",
    description:
      "The Discord bot streams table audio to Deepgram Nova-3 and ships clean transcripts to Neon in near real time.",
    icon: Mic2
  },
  {
    title: "Session Summaries",
    description:
      "Vercel AI SDK 6 turns the raw log into a structured recap with plot beats, combat outcomes, and loot.",
    icon: Sparkles
  },
  {
    title: "Always On",
    description:
      "Fly.io handles the bot while Vercel serves the admin panel and API routes for ingestion and summarization.",
    icon: ScrollText
  }
];

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden">
      <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-[280px] w-[280px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#b88c5a]/20 blur-3xl" />

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-14 px-6 py-20">
        <section className="space-y-6">
          <Badge variant="outline" className="border-primary/40 bg-background/80 px-4 py-1 text-sm uppercase tracking-[0.28em] text-primary shadow-glow">
            DND Scribe
          </Badge>
          <HomeAuthControls />
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-foreground md:text-6xl">
            Capture every dramatic pause, twist, and critical hit from your table.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Pair the Discord bot with a Neon-backed admin panel to archive transcripts, generate recaps,
            and keep your campaign lore organized.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="rounded-lg border border-border bg-card/70 px-4 py-2 text-foreground/80">Next.js + Vercel AI SDK 6</span>
            <span className="rounded-lg border border-border bg-card/70 px-4 py-2 text-foreground/80">Neon + Drizzle ORM</span>
            <span className="rounded-lg border border-border bg-card/70 px-4 py-2 text-foreground/80">Discord + Deepgram</span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <Card key={title} className="bg-card/80 border-border shadow-[0_18px_48px_rgba(42,33,27,0.12)]">
              <CardHeader>
                <Icon className="h-6 w-6 text-primary" />
                <CardTitle className="mt-4 text-xl font-semibold text-foreground">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card/80 p-6">
          <h2 className="text-xl font-semibold text-foreground">API Endpoints</h2>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
              <p className="font-semibold text-foreground">POST /api/session/start</p>
              <p>Creates a live session row and returns a session id.</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
              <p className="font-semibold text-foreground">POST /api/ingest</p>
              <p>Stores transcripts as they arrive from Discord.</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
              <p className="font-semibold text-foreground">POST /api/summarize</p>
              <p>Generates and stores the recap, then closes the session.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
