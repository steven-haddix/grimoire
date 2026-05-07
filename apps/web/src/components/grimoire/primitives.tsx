import type * as React from "react";
import { cn } from "@/lib/utils";

type WithChildren = { children: React.ReactNode; className?: string };

export function Cartouche({
  children,
  className,
  ...rest
}: WithChildren & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("cartouche", className)} {...rest}>
      <span className="corner-tl" aria-hidden />
      <span className="corner-tr" aria-hidden />
      <span className="corner-bl" aria-hidden />
      <span className="corner-br" aria-hidden />
      {children}
    </div>
  );
}

export function Crosshair({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("crosshair", className)}
      style={{ width: size, height: size, flexBasis: size }}
      aria-hidden
    />
  );
}

export function Pulse({ className }: { className?: string }) {
  return <span className={cn("pulse", className)} aria-hidden />;
}

export function Wave({
  bars = 8,
  height = 24,
  className,
}: {
  bars?: number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("wave", className)}
      style={{ height }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span key={`bar-${i}`} />
      ))}
    </span>
  );
}

export function Caret({ className }: { className?: string }) {
  return <span className={cn("caret", className)} aria-hidden />;
}

export function ImgSlot({
  label = "Illustration",
  aspect = "4 / 3",
  className,
  style,
}: {
  label?: string;
  aspect?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("imgslot", className)}
      style={{ aspectRatio: aspect, ...style }}
    >
      <span className="imgslot__lbl">{label}</span>
    </div>
  );
}

type Crumb = { label: React.ReactNode; href?: string };

export function Topbar({
  crumbs,
  right,
  className,
}: {
  crumbs: Crumb[];
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("topbar", className)}>
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span
            key={`crumb-${i}-${typeof c.label === "string" ? c.label : i}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {i > 0 && <span className="sep">/</span>}
            {c.href ? (
              <a
                href={c.href}
                className={i === crumbs.length - 1 ? "cur" : undefined}
              >
                {c.label}
              </a>
            ) : (
              <span className={i === crumbs.length - 1 ? "cur" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      {right ? (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function RailSection({
  title,
  link,
  onLinkClick,
  children,
  className,
}: {
  title: string;
  link?: React.ReactNode;
  onLinkClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <span className="t-eyebrow">{title}</span>
        {link ? (
          <button
            type="button"
            className="t-meta t-meta--lit"
            onClick={onLinkClick}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {link}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function StatusLine({
  label,
  value,
  lit,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  lit?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "0.5px dotted var(--rule-soft)",
      }}
    >
      <span className="t-meta">{label}</span>
      <span
        className="t-meta"
        style={{ color: lit ? "var(--copper)" : "var(--bone-dim)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 32,
          fontWeight: 500,
          color: "var(--bone)",
          lineHeight: 1,
          fontVariationSettings: '"opsz" 144',
        }}
      >
        {value}
      </div>
      <div className="t-meta" style={{ marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

export function Rule({
  variant = "default",
  className,
  style,
}: {
  variant?: "default" | "soft" | "dotted" | "double";
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls =
    variant === "soft"
      ? "rule-soft"
      : variant === "dotted"
        ? "rule-dotted"
        : variant === "double"
          ? "rule-double"
          : "rule";
  return <div className={cn(cls, className)} style={style} aria-hidden />;
}

export function GridUnderlay({ className }: { className?: string }) {
  return <div className={cn("grid-underlay", className)} aria-hidden />;
}

export function CornerMarks() {
  return (
    <>
      {[
        { top: 24, left: 24 },
        { top: 24, right: 24 },
        { bottom: 24, left: 24 },
        { bottom: 24, right: 24 },
      ].map((p, i) => (
        <span
          key={`corner-${i}`}
          style={{ position: "absolute", ...p }}
          aria-hidden
        >
          <span
            className="crosshair"
            style={{ width: 18, height: 18 }}
          />
        </span>
      ))}
    </>
  );
}

