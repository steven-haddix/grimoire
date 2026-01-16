import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DiscordGuildSelector } from "@/components/discord-guild-selector";

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth/sign-in");
  }

  const label =
    session.user?.email ?? session.user?.name ?? session.user?.id ?? "Adventurer";

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <Card className="w-full max-w-2xl shadow-[0_18px_48px_rgba(42,33,27,0.12)] border-border bg-card/80">
        <CardHeader className="space-y-2">
          <div className="flex">
            <Badge variant="outline" className="border-primary/40 text-primary uppercase tracking-[0.3em]">
              Account
            </Badge>
          </div>
          <CardTitle className="text-3xl text-foreground">Welcome, {label}</CardTitle>
          <CardDescription className="text-muted-foreground">
            Your Discord account is linked for session tracking and recaps.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-3 rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-foreground/80">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">User</p>
              <p className="font-semibold text-foreground">{session.user?.name ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Email</p>
              <p className="font-semibold text-foreground">{session.user?.email ?? "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">User ID</p>
              <p className="font-semibold text-foreground">{session.user?.id}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/50 p-4">
            <DiscordGuildSelector />
          </div>

          <div className="flex flex-wrap gap-3">
            <SignOutButton className="bg-foreground text-background hover:bg-foreground/90" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
