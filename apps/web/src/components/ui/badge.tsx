import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Grimoire scriptorium chips/badges: hairline border, JetBrains Mono,
// uppercase 10px, no rounded corners. Variants beyond the four shadcn
// defaults expose memory categories (lore/character/rule/meta) and
// special states (lit/live).
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap border-[0.5px] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.10em] [border-radius:1px]",
  {
    variants: {
      variant: {
        default: "border-rule text-bone-dim",
        secondary: "border-rule bg-ink-2 text-bone-dim",
        destructive: "border-destructive text-destructive",
        outline: "border-rule text-bone-dim",

        // grimoire-specific
        lit: "border-copper-dim text-copper",
        live: "border-copper bg-copper text-ink",
        lore: "border-copper-dim text-copper",
        character: "border-[oklch(0.50_0.08_245)] text-indigo",
        rule: "border-[oklch(0.45_0.06_145)] text-moss",
        meta: "border-rule text-bone-dim",
        other: "border-rule text-bone-dim",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
