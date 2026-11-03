"use client";

import { FlagIcon, HomeIcon, TicketIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDirectory } from "@/hooks/use-directory";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const TABS = [
  { href: "/home", label: "Home", icon: HomeIcon, match: (p: string) => p === "/home" },
  { href: "/tickets", label: "Tickets", icon: TicketIcon, match: (p: string) => p.startsWith("/tickets") },
  { href: "/missions", label: "Missions", icon: FlagIcon, match: (p: string) => p.startsWith("/missions") },
  { href: "/me", label: "You", icon: UserRoundIcon, match: (p: string) => p === "/me" },
];

/** Phone-only bottom navigation, shown on top-level screens (not inside a conversation). */
export function TabBar() {
  const pathname = usePathname();
  const dir = useDirectory();
  const unread = useUiStore((s) => [...dir.channels, ...dir.dms].reduce((a, c) => a + (s.unread[c] ?? 0), 0));
  if (!TABS.some((t) => t.match(pathname))) return null;

  return (
    <nav aria-label="Primary" className="shrink-0 border-t bg-background pb-safe md:hidden">
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]/4 font-medium no-underline",
                  active ? "text-brand hover:text-brand" : "text-muted-foreground hover:text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} />
                  {href === "/home" && unread > 0 && (
                    <span className="absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-unread px-1 text-2xs font-semibold text-white">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
