"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

type SignOutButtonProps = {
  className?: string;
  children?: ReactNode;
};

export function SignOutButton({ className, children }: SignOutButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      {children ?? "Sign out"}
    </Button>
  );
}
