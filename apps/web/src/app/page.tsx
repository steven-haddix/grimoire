import { Bot, Command, Mic, ScrollText, Sparkles } from "lucide-react";
import Image from "next/image";
import { HomeAuthControls } from "@/components/home-auth-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[100px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-24 space-y-24">
        {/* Hero Section */}
        <section className="flex flex-col-reverse lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left Content */}
          <div className="flex flex-col space-y-8 lg:flex-1">
            <Badge
              variant="outline"
              className="px-4 py-1 border-primary/30 text-primary bg-primary/5 uppercase tracking-widest text-xs font-semibold rounded-full w-fit"
            >
              The Ultimate Dungeon Master's Assistant
            </Badge>

            <h1 className="text-5xl md:text-6xl font-heading font-bold text-foreground leading-tight">
              Never Take{" "}
              <span className="text-primary italic">Session Notes</span> Again
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed">
              Grimoire listens to your Discord voice channel, transcribes the
              roleplay, and magically generates structured summaries, loot
              lists, and NPC logs.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <HomeAuthControls />
            </div>
          </div>

          {/* Right Visual */}
          <div className="flex lg:flex-1 w-full justify-center align-middle group cursor-default">
            <div className="w-56 h-56 sm:w-64 sm:h-64 md:w-96 md:h-92 rounded-2xl ">
              <Image
                src="/logo_dark.png"
                alt="Grimoire logo"
                className="w-full h-full object-contain dark:hidden"
                width={368}
                height={368}
              />
              <Image
                src="/logo.png"
                alt="Grimoire logo"
                className="w-full h-full object-contain dark:block hidden"
                width={368}
                height={368}
              />
            </div>
          </div>
        </section>

        {/* Session Output */}
        <section className="space-y-6">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold">
              Your Session, Captured
            </h2>
            <p className="text-lg text-muted-foreground">
              Grimoire preserves the full transcript with timestamps and
              speakers so you can revisit every scene.
            </p>
          </div>
          <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg border">
            <Image
              src="/grimoire_vp_sessions.png"
              alt="Recorded session output with transcripts and timestamps"
              className="w-full h-full object-cover"
              sizes="(max-width: 768px) 100vw, 75vw"
              width={1200}
              height={675}
            />
          </div>
        </section>

        {/* How It Works / Walkthrough */}
        <section className="space-y-10">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground">
              Three simple steps to eternalize your campaign.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Step 1: Record */}
            <div className="order-2 md:order-1 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">
                1. Record the Session
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Summon the bot to your voice channel. It listens in the
                background, distinguishing between players and capturing every
                roll, joke, and plot twist in real-time.
              </p>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/grim</span>{" "}
                <span className="text-foreground">start</span>
              </div>
            </div>
            <div className="order-1 md:order-2 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
              <Image
                src="/grimoire_vp_start_scribe.png"
                alt="Discord UI showing /grim start command"
                className="w-full h-full object-cover"
                sizes="(max-width: 768px) 100vw, 75vw"
                width={1200}
                height={675}
              />
            </div>

            {/* Step 2: Stop & Summarize */}
            <div className="order-3 md:order-3 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
              <Image
                src="/grimoire_vp_stop_scribe.png"
                alt="Grimoire bot showing session ended and summarizing"
                className="w-full h-full object-cover"
                sizes="(max-width: 768px) 100vw, 75vw"
                width={1200}
                height={675}
              />
            </div>
            <div className="order-4 md:order-4 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <ScrollText className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">
                2. Stop & Summarize
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                When the session ends, simply stop the bot. Grimoire instantly
                processes the transcript and weaves a structured summary,
                capturing key plot beats and loot.
              </p>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/grim</span>{" "}
                <span className="text-foreground">stop</span>
              </div>
            </div>

            {/* Step 3: Recap */}
            <div className="order-6 md:order-5 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">
                3. The Recap Ritual
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Start your next session with a dramatic, AI-narrated recap of
                the previous adventure, played directly into the voice channel
                to get everyone back in the zone.
              </p>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/grim</span>{" "}
                <span className="text-foreground">recap</span>
              </div>
            </div>
            <div className="order-5 md:order-6 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
              <Image
                src="/grimoire_vp_commands.png"
                alt="Discord showing grim slash commands"
                className="w-full h-full object-cover"
                sizes="(max-width: 768px) 100vw, 75vw"
                width={1200}
                height={675}
              />
            </div>
          </div>
        </section>

        {/* Features / Details */}
        <section className="py-12 space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold">
              Your Knowledge
            </h2>
            <p className="text-lg text-muted-foreground">
              Knowledge is power, and Grimoire is packed with features to
              empower
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Bot className="w-5 h-5" />
                </div>
                <h4 className="font-heading font-semibold text-lg">
                  Ask the Grimoire
                </h4>
                <p className="text-sm text-muted-foreground">
                  Forgot who that NPC was? Just ask the bot. It uses your
                  campaign's history to answer Q&A and recall facts instantly.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Command className="w-5 h-5" />
                </div>
                <h4 className="font-heading font-semibold text-lg">
                  Slash Commands
                </h4>
                <p className="text-sm text-muted-foreground">
                  Simple, intuitive discord commands. No complex configuration
                  or dashboard tweaking required to start.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <ScrollText className="w-5 h-5" />
                </div>
                <h4 className="font-heading font-semibold text-lg">
                  Lore Archive
                </h4>
                <p className="text-sm text-muted-foreground">
                  Every session is saved, indexed, and searchable. Build a
                  living history of your campaign automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border pt-8 pb-12 text-center space-y-6">
          <div className="flex items-center justify-center">
            <ThemeToggle />
          </div>
        </footer>
      </div>
    </main>
  );
}
