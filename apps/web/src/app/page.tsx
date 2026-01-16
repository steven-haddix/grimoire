import { Mic2, ScrollText, Sparkles } from "lucide-react";
import { HomeAuthControls } from "@/components/home-auth-controls";

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
      <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-ember/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-[280px] w-[280px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#b88c5a]/20 blur-3xl" />

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-14 px-6 py-20">
        <section className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-ember/40 bg-white/80 px-4 py-1 text-sm uppercase tracking-[0.28em] text-ember shadow-glow">
            DND Scribe
          </p>
          <HomeAuthControls />
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-6xl">
            Capture every dramatic pause, twist, and critical hit from your table.
          </h1>
          <p className="max-w-2xl text-lg text-ink/80">
            Pair the Discord bot with a Neon-backed admin panel to archive transcripts, generate recaps,
            and keep your campaign lore organized.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="rounded-lg border border-ink/10 bg-white/70 px-4 py-2">Next.js + Vercel AI SDK 6</span>
            <span className="rounded-lg border border-ink/10 bg-white/70 px-4 py-2">Neon + Drizzle ORM</span>
            <span className="rounded-lg border border-ink/10 bg-white/70 px-4 py-2">Discord + Deepgram</span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-ink/10 bg-white/80 p-6 shadow-[0_18px_48px_rgba(42,33,27,0.12)]"
            >
              <Icon className="h-6 w-6 text-ember" />
              <h2 className="mt-4 text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm text-ink/75">{description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white/80 p-6">
          <h2 className="text-xl font-semibold text-ink">API Endpoints</h2>
          <div className="mt-4 grid gap-3 text-sm text-ink/80 md:grid-cols-3">
            <div className="rounded-lg border border-ink/10 bg-parchment/70 px-4 py-3">
              <p className="font-semibold text-ink">POST /api/session/start</p>
              <p>Creates a live session row and returns a session id.</p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-parchment/70 px-4 py-3">
              <p className="font-semibold text-ink">POST /api/ingest</p>
              <p>Stores transcripts as they arrive from Discord.</p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-parchment/70 px-4 py-3">
              <p className="font-semibold text-ink">POST /api/summarize</p>
              <p>Generates and stores the recap, then closes the session.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
