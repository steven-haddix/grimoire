import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Grimoire scriptorium buttons: hairline borders, JetBrains Mono labels,
// uppercase, no rounded corners. The "default" variant is the secondary
// outline button (most common). "primary" is the copper-fill CTA.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.10em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-[0.5px] border-rule text-bone-dim hover:text-bone hover:border-bone-dim",
        primary:
          "bg-copper text-ink border-[0.5px] border-copper hover:bg-bone hover:border-bone",
        outline:
          "border-[0.5px] border-rule text-bone-dim hover:text-bone hover:border-bone-dim",
        secondary:
          "border-[0.5px] border-rule bg-ink-2 text-bone-dim hover:text-bone hover:border-bone-dim",
        ghost:
          "border-[0.5px] border-transparent text-bone-dim hover:text-bone hover:border-bone-dim",
        destructive:
          "bg-destructive text-bone border-[0.5px] border-destructive hover:opacity-80",
        link: "text-copper underline-offset-4 hover:underline border-0",
      },
      size: {
        default: "h-8 px-3.5",
        sm: "h-7 px-2.5 text-[10px]",
        lg: "h-10 px-5 text-[12px]",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
