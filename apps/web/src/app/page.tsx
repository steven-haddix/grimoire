import Image from "next/image";
import Link from "next/link";
import { HomeAuthControls } from "@/components/home-auth-controls";
import {
  Asterism,
  Compass,
  Diamond,
  Quill,
  Rosette,
} from "@/components/grimoire/marks";
import { CornerMarks, GridUnderlay } from "@/components/grimoire/primitives";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <GridUnderlay />
      <CornerMarks />

      {/* Top brand strip */}
      <header
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 40px",
          borderBottom: "0.5px solid var(--rule-soft)",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 28,
              height: 28,
              border: "0.5px solid var(--copper-dim)",
              display: "grid",
              placeItems: "center",
              color: "var(--copper)",
              fontFamily: "var(--serif)",
              fontSize: 14,
              fontStyle: "italic",
              fontVariationSettings: '"opsz" 144',
            }}
          >
            G
          </span>
          <span
            className="t-display"
            style={{ fontSize: 22, fontWeight: 500 }}
          >
            Grimoire
          </span>
        </div>
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--bone-dim)",
          }}
          className="hidden md:flex"
        >
          <a href="#how-it-works" style={{ textDecoration: "none", color: "inherit" }}>
            how it works
          </a>
          <a href="#features" style={{ textDecoration: "none", color: "inherit" }}>
            features
          </a>
          <Link
            href="/auth/sign-in"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            sign in
          </Link>
        </nav>
      </header>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "80px 40px 120px",
        }}
      >
        {/* HERO */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 80,
            alignItems: "center",
            marginBottom: 140,
          }}
          className="hero-grid"
        >
          <div>
            <div
              className="t-eyebrow"
              style={{ marginBottom: 18 }}
            >
              FOLIO 001 · A SCRIBE FOR YOUR TABLE
            </div>
            <h1
              className="t-display"
              style={{
                fontSize: "clamp(56px, 8vw, 104px)",
                marginBottom: 28,
              }}
            >
              Every session,
              <br />
              <em>remembered.</em>
            </h1>
            <p
              style={{
                color: "var(--bone-dim)",
                fontSize: 18,
                lineHeight: 1.6,
                marginBottom: 36,
                maxWidth: 540,
              }}
            >
              Grimoire listens to your Discord voice channel, transcribes every
              roll and revelation, and writes a structured chronicle for the
              campaign — searchable, editable, and remembered between sessions.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <HomeAuthControls />
              <Link
                href="#how-it-works"
                className="t-meta t-meta--lit"
                style={{ textDecoration: "none" }}
              >
                see how it works ↓
              </Link>
            </div>

            <div
              style={{
                marginTop: 56,
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                color: "var(--bone-mute)",
              }}
            >
              <span className="t-meta">slash-command driven</span>
              <span className="t-meta">·</span>
              <span className="t-meta">per-server scoped</span>
              <span className="t-meta">·</span>
              <span className="t-meta">markdown summaries</span>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              minHeight: 360,
            }}
          >
            <div style={{ position: "relative", color: "var(--copper)" }}>
              <Rosette size={420} />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "var(--bone-dim)",
              }}
            >
              <Compass size={140} />
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section
          id="how-it-works"
          style={{ marginBottom: 140, scrollMarginTop: 80 }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 48,
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="t-eyebrow">II · the workflow</div>
              <h2
                className="t-display"
                style={{ fontSize: "clamp(40px, 5vw, 64px)", marginTop: 12 }}
              >
                Three commands
                <br />
                <em>that's all.</em>
              </h2>
            </div>
            <Asterism size={20} className="opacity-60" />
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 1,
              background: "var(--rule-soft)",
              border: "0.5px solid var(--rule)",
            }}
          >
            <Step
              n="01"
              command="/grim start"
              title="Summon the scribe"
              body="Invite the bot into your voice channel. It listens in the background, distinguishing speakers and capturing every roll, joke, and plot beat in real time."
            />
            <Step
              n="02"
              command="/grim stop"
              title="Close the book"
              body="When the session ends, Grimoire stops recording, processes the transcript, and weaves a structured summary you can read on the web — or hand back to your players."
            />
            <Step
              n="03"
              command="/grim recap"
              title="The recap ritual"
              body="Begin the next session with an AI-narrated recap, played back in voice. Everyone arrives caught up, and the chronicle continues."
            />
          </div>
        </section>

        {/* FEATURES */}
        <section
          id="features"
          style={{ marginBottom: 100, scrollMarginTop: 80 }}
        >
          <header style={{ marginBottom: 48 }}>
            <div className="t-eyebrow">III · what it does</div>
            <h2
              className="t-display"
              style={{ fontSize: "clamp(40px, 5vw, 64px)", marginTop: 12 }}
            >
              Knowledge,
              <br />
              <em>kept.</em>
            </h2>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 1,
              background: "var(--rule-soft)",
              border: "0.5px solid var(--rule)",
            }}
          >
            <Feature
              icon={<Quill size={28} />}
              title="Live transcription"
              body="Per-speaker, timestamped, searchable. Deepgram nova-3 in your voice channel."
            />
            <Feature
              icon={<Compass size={28} />}
              title="Structured summaries"
              body="Markdown summaries with headings, threads, NPCs, and loot — generated when the session ends."
            />
            <Feature
              icon={<Rosette size={28} />}
              title="The campaign brain"
              body="Long-lived memories the agent draws on whenever someone @-mentions it in chat or voice."
            />
            <Feature
              icon={<Diamond size={20} />}
              title="In-voice recall"
              body="Ask the scribe in voice — “what was the innkeeper wearing?” — and hear the answer back, in character if you like."
            />
          </div>
        </section>

        {/* CTA */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "60px 32px",
            border: "0.5px solid var(--rule)",
            background: "var(--ink-2)",
            position: "relative",
          }}
        >
          <span className="corner-tl" aria-hidden style={cornerStyle("tl")} />
          <span className="corner-tr" aria-hidden style={cornerStyle("tr")} />
          <span className="corner-bl" aria-hidden style={cornerStyle("bl")} />
          <span className="corner-br" aria-hidden style={cornerStyle("br")} />
          <div className="t-eyebrow" style={{ marginBottom: 14 }}>
            INVITE THE SCRIBE
          </div>
          <h2
            className="t-display"
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              maxWidth: 720,
              marginBottom: 18,
            }}
          >
            Bring Grimoire to <em>your table.</em>
          </h2>
          <p
            style={{
              color: "var(--bone-dim)",
              maxWidth: 540,
              marginBottom: 32,
            }}
          >
            Sign in with Discord and install the bot in any server you
            administer. Each campaign gets its own chronicle.
          </p>
          <HomeAuthControls />
        </section>

        {/* Optional product images preserved */}
        <section
          style={{
            marginTop: 100,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 32,
          }}
          className="screenshots-grid"
        >
          <Screenshot
            src="/grimoire_vp_sessions.png"
            alt="Recorded session output"
            label="Session recording"
          />
          <Screenshot
            src="/grimoire_vp_start_scribe.png"
            alt="/grim start command"
            label="/grim start"
          />
        </section>
      </div>

      {/* Foot */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "0.5px solid var(--rule-soft)",
          padding: "32px 40px",
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <span
          className="t-meta"
          style={{ letterSpacing: "0.30em" }}
        >
          GRIMOIRE · 2026
        </span>
        <span className="t-meta">FOLIO 001 · INTROIT</span>
        <Link
          href="/auth/sign-in"
          className="t-meta t-meta--lit"
          style={{ textDecoration: "none" }}
        >
          enter →
        </Link>
      </footer>
    </main>
  );
}

function Step({
  n,
  command,
  title,
  body,
}: {
  n: string;
  command: string;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        background: "var(--ink)",
        padding: "36px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            color: "var(--copper)",
            fontSize: 13,
            letterSpacing: "0.16em",
          }}
        >
          {n}
        </span>
        <code
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--bone-dim)",
            border: "0.5px solid var(--rule)",
            padding: "3px 8px",
          }}
        >
          {command}
        </code>
      </div>
      <h3
        style={{
          fontFamily: "var(--serif)",
          fontSize: 28,
          fontWeight: 500,
          margin: 0,
          color: "var(--bone)",
          fontVariationSettings: '"opsz" 144',
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: "var(--bone-dim)",
          margin: 0,
          fontSize: 14.5,
          lineHeight: 1.6,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        background: "var(--ink)",
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <span
        style={{
          color: "var(--copper)",
          width: 36,
          height: 36,
          display: "grid",
          placeItems: "center",
          border: "0.5px solid var(--copper-dim)",
        }}
      >
        {icon}
      </span>
      <h3
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          fontWeight: 500,
          margin: 0,
          color: "var(--bone)",
          fontVariationSettings: '"opsz" 144',
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: "var(--bone-dim)",
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function Screenshot({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label: string;
}) {
  return (
    <figure
      style={{
        margin: 0,
        border: "0.5px solid var(--rule)",
        background: "var(--ink-2)",
        padding: 14,
        position: "relative",
      }}
    >
      <span className="corner-tl" aria-hidden style={cornerStyle("tl")} />
      <span className="corner-tr" aria-hidden style={cornerStyle("tr")} />
      <span className="corner-bl" aria-hidden style={cornerStyle("bl")} />
      <span className="corner-br" aria-hidden style={cornerStyle("br")} />
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          width: "100%",
          overflow: "hidden",
          background: "var(--ink)",
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          style={{ objectFit: "cover" }}
        />
      </div>
      <figcaption className="t-meta" style={{ marginTop: 12 }}>
        {label}
      </figcaption>
    </figure>
  );
}

function cornerStyle(corner: "tl" | "tr" | "bl" | "br"): React.CSSProperties {
  return {
    position: "absolute",
    width: 8,
    height: 8,
    borderColor: "var(--copper)",
    borderStyle: "solid",
    borderWidth: 0,
    ...(corner === "tl"
      ? { top: -1, left: -1, borderTopWidth: 0.5, borderLeftWidth: 0.5 }
      : corner === "tr"
        ? { top: -1, right: -1, borderTopWidth: 0.5, borderRightWidth: 0.5 }
        : corner === "bl"
          ? {
              bottom: -1,
              left: -1,
              borderBottomWidth: 0.5,
              borderLeftWidth: 0.5,
            }
          : {
              bottom: -1,
              right: -1,
              borderBottomWidth: 0.5,
              borderRightWidth: 0.5,
            }),
  };
}
