import { HomeAuthControls } from "@/components/home-auth-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InstallBotButton } from "@/components/install-bot-button";
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
            <InstallBotButton />
          </div>

          {/* Hero Visual Placeholder */}
          <div className="w-full max-w-4xl mt-12 relative group cursor-default">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative aspect-video bg-card border border-border rounded-lg shadow-2xl flex items-center justify-center overflow-hidden">
              <div className="text-center space-y-4 p-8">
                <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center">
                   <Sparkles className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium text-sm">
                  [Placeholder: App Dashboard Screenshot]<br/>
                  <span className="text-xs opacity-70">Showing a session summary with "Plot Beats" and "Loot" sections.</span>
                </p>
              </div>
            </div>
          </div>
        </section>


        {/* How It Works / Walkthrough */}
        <section className="space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold">How It Works</h2>
            <p className="text-lg text-muted-foreground">From start to finish, Scribe handles the boring stuff.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Step 1: Start */}
            <div className="order-2 md:order-1 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">1. Summon the Scribe</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Join your voice channel and summon the bot. It immediately begins listening to the conversation, distinguishing between players.
              </p>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/scribe</span> <span className="text-foreground">start</span>
              </div>
            </div>
            <div className="order-1 md:order-2 relative aspect-video bg-card/50 border border-border/60 border-dashed rounded-xl flex items-center justify-center">
               <p className="text-center text-muted-foreground text-sm p-4">
                 [Placeholder: Discord UI Screenshot]<br/>
                 <span className="text-xs opacity-70">Showing user executing the /scribe start command.</span>
               </p>
            </div>


            {/* Step 2: Play */}
            <div className="order-3 md:order-3 relative aspect-video bg-card/50 border border-border/60 border-dashed rounded-xl flex items-center justify-center">
              <p className="text-center text-muted-foreground text-sm p-4">
                 [Placeholder: Active Session Screenshot]<br/>
                 <span className="text-xs opacity-70">Showing the bot in the voice channel user list.</span>
               </p>
            </div>
            <div className="order-4 md:order-4 space-y-6">
               <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <Sword className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">2. Play Your Game</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Forget about taking notes. Focus on the roleplay, combat, and chaos. Scribe captures everything in real-time securely.
              </p>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <span>Need an NPC voice? Use <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/scribe say</code></span>
                </li>
                <li className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Handles cross-talk and multiple speakers</span>
                </li>
              </ul>
            </div>

             {/* Step 3: Stop */}
            <div className="order-6 md:order-5 space-y-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                <ScrollText className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold font-heading">3. Instant Recap</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                When the session ends, stop the bot. Within seconds, your dashboard is updated with a comprehensive summary generated by advanced AI.
              </p>
               <div className="bg-card border border-border rounded-md p-4 font-mono text-sm shadow-sm">
                <span className="text-primary">/scribe</span> <span className="text-foreground">stop</span>
              </div>
            </div>
            <div className="order-5 md:order-6 relative aspect-video bg-card/50 border border-border/60 border-dashed rounded-xl flex items-center justify-center">
               <p className="text-center text-muted-foreground text-sm p-4">
                 [Placeholder: Summary Result Screenshot]<br/>
                 <span className="text-xs opacity-70">Showing the final generated recap on the web page.</span>
               </p>
            </div>
          </div>
        </section>


        {/* Features / Details */}
        <section className="py-12">
           <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-card/50 border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h4 className="font-heading font-semibold text-lg">AI-Powered</h4>
                  <p className="text-sm text-muted-foreground">Uses the latest models to intelligently parse game terms, loot, and combat stats from spoken word.</p>
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
                  <p className="text-sm text-muted-foreground">Every session is saved and indexed. Build a searchable history of your campaign automatically.</p>
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