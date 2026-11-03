"use client";

import { ChevronDownIcon, HashIcon, MonitorIcon, MoonIcon, SquarePenIcon, SunIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/common/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { ACCENTS, CHANNELS, CHAT_META, DMS, PEOPLE, WORKSPACE_NAME } from "@/lib/constants";
import { THEME_OPTIONS } from "@/lib/theme";
import { ROLE_LABEL, ROLE_OPTION_LABEL } from "@/lib/rbac";
import type { ChatId, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type ThemePref, useUiStore } from "@/stores/ui-store";

const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn("px-2.5 pb-1.5 text-xs font-semibold tracking-[0.04em] text-sidebar-muted uppercase", first ? "pt-3" : "pt-[18px]")}>
      {children}
    </div>
  );
}

function NavLink({
  href,
  active,
  bold,
  onNavigate,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  bold?: boolean;
  onNavigate?: () => void;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        onClick?.();
        onNavigate?.();
      }}
      className={cn(
        "flex min-h-[34px] w-full items-center gap-2 rounded-md px-2.5 py-[5px] text-body no-underline transition-colors",
        active
          ? "bg-brand font-bold text-white hover:text-white"
          : cn("hover:bg-sidebar-hover", bold ? "font-bold text-white hover:text-white" : "text-sidebar-foreground hover:text-sidebar-foreground"),
      )}
    >
      {children}
    </Link>
  );
}

function UnreadBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-unread px-1.5 text-xs font-bold text-white">
      {n}
    </span>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeChat = useActiveChat();
  const unread = useUiStore((s) => s.unread);
  const markRead = useUiStore((s) => s.markRead);
  const role = useUiStore((s) => s.role);
  const setRole = useUiStore((s) => s.setRole);
  const accent = useUiStore((s) => s.accent);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setAccent = useUiStore((s) => s.setAccent);
  const { visible } = useVisibleTickets();

  const enterChat = (id: ChatId) => {
    markRead(id);
    useUiStore.setState({ threadId: null });
  };

  const me = PEOPLE.me;

  return (
    <nav aria-label="Workspace" className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1 py-1.5 text-base font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {WORKSPACE_NAME}
            <ChevronDownIcon className="size-3.5" strokeWidth={2.2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
              {THEME_OPTIONS.map((o) => {
                const Icon = THEME_ICON[o.value];
                return (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    <Icon className="size-4 text-muted-foreground" />
                    {o.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspace accent</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={accent} onValueChange={setAccent}>
              {ACCENTS.map((a) => (
                <DropdownMenuRadioItem key={a.value} value={a.value}>
                  <span className="size-3 rounded-sm" style={{ background: a.value }} />
                  {a.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">Signed in as {me.name}</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label="New message"
          className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-hover"
        >
          <SquarePenIcon className="size-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        <SectionLabel first>Channels</SectionLabel>
        {CHANNELS.map((id) => {
          const meta = CHAT_META[id];
          const active = activeChat === id;
          const n = unread[id] ?? 0;
          return (
            <NavLink key={id} href={`/chat/${id}`} active={active} bold={n > 0} onNavigate={onNavigate} onClick={() => enterChat(id)}>
              <HashIcon aria-hidden className="size-4 w-5 opacity-75" />
              <span className="flex-1 truncate">{meta.kind === "channel" ? meta.label : id}</span>
              {n > 0 && !active && <UnreadBadge n={n} />}
            </NavLink>
          );
        })}

        <SectionLabel>Direct messages</SectionLabel>
        {DMS.map((id) => {
          const meta = CHAT_META[id];
          const p = PEOPLE[meta.kind === "dm" ? meta.who : "me"];
          const active = activeChat === id;
          const n = unread[id] ?? 0;
          return (
            <NavLink key={id} href={`/chat/${id}`} active={active} bold={n > 0} onNavigate={onNavigate} onClick={() => enterChat(id)}>
              <Avatar person={p} size="xs" presence className="size-5 rounded-[5px] text-2xs" ringClassName={active ? "border-brand" : "border-sidebar"} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.isAgent && (
                <span className="rounded border border-sidebar-agent-border px-[5px] py-px text-2xs font-bold tracking-[0.05em] text-sidebar-agent">AGENT</span>
              )}
              {n > 0 && !active && <UnreadBadge n={n} />}
            </NavLink>
          );
        })}

        <SectionLabel>Tickets</SectionLabel>
        {[
          { href: "/tickets", label: "All tickets", count: visible.length },
          { href: "/tickets/mine", label: "Assigned to me", count: visible.filter((t) => t.assignee === "me").length },
        ].map((n) => (
          <NavLink key={n.href} href={n.href} active={pathname === n.href} onNavigate={onNavigate} onClick={() => useUiStore.setState({ threadId: null })}>
            <TicketIcon aria-hidden className="size-[18px] w-5 opacity-80" />
            <span className="flex-1">{n.label}</span>
            <span className="text-xs font-semibold opacity-85">{n.count}</span>
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 pt-3 pb-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar person={me} size="lg" presence className="text-xs" ringClassName="border-sidebar size-2.5" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">{me.name}</span>
            <span className="text-xs text-sidebar-muted">{ROLE_LABEL[role]}</span>
          </div>
        </div>
        <label htmlFor="role-select" className="text-2xs font-semibold tracking-[0.04em] text-sidebar-muted uppercase">
          View as role (RBAC demo)
        </label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger id="role-select" className="h-9 border-sidebar-input-border bg-sidebar-input text-meta text-white [&_svg]:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_OPTION_LABEL) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_OPTION_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}
