import { notFound } from "next/navigation";
import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";

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
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-ink/10 bg-white/80 p-6 shadow-[0_18px_48px_rgba(42,33,27,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ember">
          Discord Auth
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-ink">{headline}</h1>
          <p className="text-sm text-ink/70">{helperText}</p>
        </div>
        <DiscordSignInButton className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/90">
          Continue with Discord
        </DiscordSignInButton>
        <p className="text-xs text-ink/60">
          You will be redirected to Discord to complete sign-in.
        </p>
      </div>
    </main>
  );
}
