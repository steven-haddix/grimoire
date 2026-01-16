import { notFound } from "next/navigation";
import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const allowedPaths = new Set(["sign-in", "sign-up"]);

export default async function AuthPage({
  params,
}: { params: Promise<{ path: string }> }) {
  const { path } = await params;

  if (!allowedPaths.has(path)) {
    notFound();
  }

  const headline = path === "sign-up" ? "Create your account" : "Welcome back";
  const helperText =
    path === "sign-up"
      ? "Join the table by authenticating with Discord."
      : "Reconnect your Discord identity to continue.";

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <Card className="w-full max-w-md shadow-[0_18px_48px_rgba(42,33,27,0.12)] border-border bg-card/80">
        <CardHeader className="space-y-2">
          <div className="flex">
            <Badge variant="outline" className="border-primary/40 text-primary uppercase tracking-[0.3em]">
              Discord Auth
            </Badge>
          </div>
          <CardTitle className="text-3xl font-semibold text-foreground">{headline}</CardTitle>
          <CardDescription className="text-muted-foreground">{helperText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <DiscordSignInButton className="w-full font-semibold shadow-glow">
            Continue with Discord
          </DiscordSignInButton>
          <p className="text-xs text-muted-foreground">
            You will be redirected to Discord to complete sign-in.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
