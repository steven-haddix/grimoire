"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FileText, Map } from "lucide-react";

const items = [
  {
    title: "Dashboard",
    href: "/account",
    icon: LayoutDashboard,
  },
  {
    title: "Summaries",
    href: "/account/sessions",
    icon: FileText,
  },
  {
    title: "Campaigns",
    href: "/account/campaigns",
    icon: Map,
  },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive ? "bg-accent text-accent-foreground" : "transparent"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
