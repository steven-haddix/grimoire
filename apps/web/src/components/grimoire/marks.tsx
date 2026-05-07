type SizeProp = { size?: number; className?: string };
type SigilProp = SizeProp & { glyph?: string };

export function Compass({ size = 24, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" />
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
      <path
        d="M12 4 L13.5 12 L12 20 L10.5 12 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M4 12 L12 13.2 L20 12 L12 10.8 Z"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );
}

export function Rosette({ size = 24, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 12 + Math.cos(a) * 6;
        const y1 = 12 + Math.sin(a) * 6;
        const x2 = 12 + Math.cos(a) * 10;
        const y2 = 12 + Math.sin(a) * 10;
        return (
          <line
            key={`spoke-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        );
      })}
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Quill({ size = 24, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
      strokeLinecap="square"
      className={className}
      aria-hidden
    >
      <path d="M4 20 L20 4" />
      <path d="M4 20 L8 20 L8 16" />
      <path d="M14 4 L20 4 L20 10" />
      <path d="M9 15 L13 15 M11 13 L13 13 M11 17 L9 17" />
    </svg>
  );
}

export function Asterism({ size = 14, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="7" cy="3" r="1" />
      <circle cx="3" cy="11" r="1" />
      <circle cx="11" cy="11" r="1" />
    </svg>
  );
}

export function Tick({ size = 10, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      className={className}
      aria-hidden
    >
      <line x1="5" y1="0" x2="5" y2="10" />
      <line x1="0" y1="5" x2="10" y2="5" />
    </svg>
  );
}

export function Sigil({ size = 24, glyph = "G", className }: SigilProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        stroke="currentColor"
        strokeWidth="0.5"
      />
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="0.5"
      />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontFamily='"Fraunces", serif'
        fontSize="11"
        fill="currentColor"
        fontStyle="italic"
      >
        {glyph}
      </text>
    </svg>
  );
}

export function Diamond({ size = 8, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M4 0 L8 4 L4 8 L0 4 Z" />
    </svg>
  );
}

export function Dice({ size = 16, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
      className={className}
      aria-hidden
    >
      <path d="M8 1 L15 5 L15 11 L8 15 L1 11 L1 5 Z" />
      <path d="M8 1 L8 8 M1 5 L8 8 M15 5 L8 8" />
    </svg>
  );
}

export function BrandMark({ size = 28, className }: SizeProp) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="0.5"
        y="0.5"
        width="27"
        height="27"
        stroke="var(--copper-dim)"
        strokeWidth="0.5"
      />
      <circle
        cx="14"
        cy="14"
        r="9"
        stroke="var(--copper-dim)"
        strokeWidth="0.5"
      />
      <path
        d="M14 5 L14 23 M5 14 L23 14"
        stroke="var(--copper-dim)"
        strokeWidth="0.5"
      />
      <text
        x="14"
        y="17.5"
        textAnchor="middle"
        fontFamily='"Fraunces", serif'
        fontSize="11"
        fill="var(--copper)"
        fontStyle="italic"
        fontWeight="500"
      >
        G
      </text>
    </svg>
  );
}

export function CompassLarge({ size = 280, className }: SizeProp) {
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={className}
      aria-hidden
    >
      <circle
        cx={center}
        cy={center}
        r={center - 2}
        stroke="var(--rule)"
        strokeWidth="0.5"
      />
      <circle
        cx={center}
        cy={center}
        r={center - 22}
        stroke="var(--rule)"
        strokeWidth="0.5"
      />
      <circle
        cx={center}
        cy={center}
        r={center - 66}
        stroke="var(--copper-dim)"
        strokeWidth="0.5"
      />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i * Math.PI) / 12;
        const r1 = center - 22;
        const r2 = i % 6 === 0 ? center - 40 : center - 30;
        return (
          <line
            key={`tick-${i}`}
            x1={center + Math.cos(a) * r1}
            y1={center + Math.sin(a) * r1}
            x2={center + Math.cos(a) * r2}
            y2={center + Math.sin(a) * r2}
            stroke="var(--bone-dim)"
            strokeWidth="0.5"
            opacity={i % 6 === 0 ? 1 : 0.5}
          />
        );
      })}
      <path
        d={`M${center} ${center - 100} L${center + 10} ${center} L${center} ${center + 100} L${center - 10} ${center} Z`}
        fill="var(--copper)"
        opacity="0.85"
      />
      <path
        d={`M${center - 100} ${center} L${center} ${center + 10} L${center + 100} ${center} L${center} ${center - 10} Z`}
        fill="var(--bone-dim)"
        opacity="0.5"
      />
      <circle cx={center} cy={center} r="4" fill="var(--copper)" />
      <text
        x={center}
        y="32"
        textAnchor="middle"
        fontFamily='"JetBrains Mono", monospace'
        fontSize="10"
        fill="var(--bone-dim)"
        letterSpacing="2"
      >
        N
      </text>
      <text
        x={center}
        y={size - 24}
        textAnchor="middle"
        fontFamily='"JetBrains Mono", monospace'
        fontSize="10"
        fill="var(--bone-dim)"
        letterSpacing="2"
      >
        S
      </text>
      <text
        x="20"
        y={center + 4}
        textAnchor="middle"
        fontFamily='"JetBrains Mono", monospace'
        fontSize="10"
        fill="var(--bone-dim)"
        letterSpacing="2"
      >
        W
      </text>
      <text
        x={size - 20}
        y={center + 4}
        textAnchor="middle"
        fontFamily='"JetBrains Mono", monospace'
        fontSize="10"
        fill="var(--bone-dim)"
        letterSpacing="2"
      >
        E
      </text>
    </svg>
  );
}
