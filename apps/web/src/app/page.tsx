import { HomeAuthControls } from "@/components/home-auth-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Play, Square, Bot, Sparkles, ScrollText, Command, Sword, Users } from "lucide-react";
import Link from "next/link";

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
        <section className="flex flex-col items-center text-center space-y-8">
          <Badge variant="outline" className="px-4 py-1 border-primary/30 text-primary bg-primary/5 uppercase tracking-widest text-xs font-semibold rounded-full">
            The Ultimate Dungeon Master's Assistant
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-heading font-bold text-foreground leading-tight max-w-4xl">
            Never Take <span className="text-primary italic">Session Notes</span> Again
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Grimoire listens to your Discord voice channel, transcribes the roleplay, and magically generates structured summaries, loot lists, and NPC logs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4">
            <HomeAuthControls />
          </div>

          {/* Hero Visual Placeholder */}
          <div className="w-full max-w-4xl mt-12 relative group cursor-default">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative aspect-video bg-card border border-border rounded-lg shadow-2xl flex items-center justify-center overflow-hidden">
              <div className="text-center space-y-4 p-8">
                <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center">
                   <Sparkles className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <img src="/grimoire_vp_sessions.png" alt="Discord UI showing /scribe start command" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </section>


        {/* How It Works / Walkthrough */}
        <section className="space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold">How It Works</h2>
            <p className="text-lg text-muted-foreground">Three simple steps to eternalize your campaign.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Step 1: Record */}
            <div className="order-2 md:order-1 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">1. Record the Session</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Summon the bot to your voice channel. It listens in the background, distinguishing between players and capturing every roll, joke, and plot twist in real-time.
              </p>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/scribe</span> <span className="text-foreground">start</span>
              </div>
            </div>
            <div className="order-1 md:order-2 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
               <img src="/grimoire_vp_start_scribe.png" alt="Discord UI showing /scribe start command" className="w-full h-full object-cover" />
            </div>

            {/* Step 2: Stop & Summarize */}
            <div className="order-3 md:order-3 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
              <img src="/grimoire_vp_stop_scribe.png" alt="Grimoire bot showing session ended and summarizing" className="w-full h-full object-cover" />
            </div>
            <div className="order-4 md:order-4 space-y-6">
               <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <ScrollText className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">2. Stop & Summarize</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                When the session ends, simply stop the bot. Grimoire instantly processes the transcript and weaves a structured summary, capturing key plot beats and loot.
              </p>
               <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/scribe</span> <span className="text-foreground">stop</span>
              </div>
            </div>

             {/* Step 3: Recap */}
            <div className="order-6 md:order-5 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">3. The Recap Ritual</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Start your next session with a dramatic, AI-narrated recap of the previous adventure, played directly into the voice channel to get everyone back in the zone.
              </p>
               <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/scribe</span> <span className="text-foreground">recap</span>
              </div>
            </div>
            <div className="order-5 md:order-6 relative aspect-video bg-card/50 border border-border/60 rounded-xl overflow-hidden shadow-lg">
               <img src="/grimoire_vp_commands.png" alt="Discord showing scribe slash commands" className="w-full h-full object-cover" />
            </div>
          </div>
        </section>


        {/* Features / Details */}
        <section className="py-12">
           <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h4 className="font-heading font-semibold text-lg">Ask the Grimoire</h4>
                  <p className="text-sm text-muted-foreground">Forgot who that NPC was? Just ask the bot. It uses your campaign's history to answer Q&A and recall facts instantly.</p>
                </CardContent>
              </Card>
               <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Command className="w-5 h-5" />
                  </div>
                  <h4 className="font-heading font-semibold text-lg">Slash Commands</h4>
                  <p className="text-sm text-muted-foreground">Simple, intuitive discord commands. No complex configuration or dashboard tweaking required to start.</p>
                </CardContent>
              </Card>
               <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <ScrollText className="w-5 h-5" />
                  </div>
                  <h4 className="font-heading font-semibold text-lg">Lore Archive</h4>
                  <p className="text-sm text-muted-foreground">Every session is saved, indexed, and searchable. Build a living history of your campaign automatically.</p>
                </CardContent>
              </Card>
           </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border pt-8 pb-12 text-center space-y-6">
           <p className="text-sm text-muted-foreground">
             Built with <Link href="https://nextjs.org" className="underline hover:text-foreground">Next.js</Link>, <Link href="https://discord.js.org" className="underline hover:text-foreground">Discord.js</Link>, and <Link href="https://deepgram.com" className="underline hover:text-foreground">Deepgram</Link>.
           </p>
        </footer>

      </div>
    </main>
  );
}