import Image from "next/image";
import { notFound } from "next/navigation";
import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";
import { Diamond } from "@/components/grimoire/marks";
import { CornerMarks, GridUnderlay } from "@/components/grimoire/primitives";

const allowedPaths = new Set(["sign-in", "sign-up"]);

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!allowedPaths.has(path)) notFound();

  const isSignUp = path === "sign-up";
  const titlePrefix = isSignUp ? "Begin a new" : "Every session,";
  const titleEm = isSignUp ? "chronicle." : "remembered.";
  const subtitle = isSignUp
    ? "Authenticate with Discord to bring Grimoire to your tables."
    : "A scribe for your tabletop, in your Discord";

  return (
    <main className="login">
      <GridUnderlay />
      <CornerMarks />

      <div
        style={{
          position: "absolute",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <span className="t-meta" style={{ letterSpacing: "0.30em" }}>
          GRIMOIRE · 2026
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <span className="t-meta">FOLIO 001 · INTROIT</span>
      </div>

      <div className="login__center">
        <div
          className="login__compass"
          style={{
            display: "grid",
            placeItems: "center",
          }}
        >
          <Image
            src="/logo.png"
            alt="Grimoire"
            width={240}
            height={240}
            priority
            style={{
              width: 240,
              height: 240,
              objectFit: "contain",
            }}
          />
        </div>
        <h1 className="login__title">
          {titlePrefix}
          <br />
          <em>{titleEm}</em>
        </h1>
        <p className="login__sub">{subtitle}</p>

        <DiscordSignInButton className="px-5 py-3 text-[12px]">
          <Diamond size={6} /> Continue with Discord
        </DiscordSignInButton>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            justifyContent: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <span className="t-meta">slash-command driven</span>
          <span className="t-meta">·</span>
          <span className="t-meta">per-server scoped</span>
          <span className="t-meta">·</span>
          <span className="t-meta">markdown summaries</span>
        </div>
      </div>
    </main>
  );
}
