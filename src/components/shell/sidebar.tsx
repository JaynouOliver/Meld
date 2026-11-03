"use client";

import { ChevronDownIcon, HashIcon, LogOutIcon, MonitorIcon, MoonIcon, PlusIcon, SettingsIcon, SquarePenIcon, SunIcon, TicketIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { switchWorkspace } from "@/lib/api/remote";
import { clearLocalCache } from "@/lib/cache";
import { signOut } from "@/lib/auth/browser";
import { CreateChannelDialog, NewMessageDialog } from "@/components/workspace/channel-dialogs";
import { PeopleDialog } from "@/components/workspace/people-dialog";
import { AgentDialog } from "@/components/agents/agent-dialog";
import { useWorkingAgents } from "@/hooks/use-agent-runs";
import { SettingsDialog } from "@/components/workspace/settings-dialog";
import { ACCENTS } from "@/lib/constants";
import { agentDmOf, agentsOf, personOf } from "@/lib/directory";
import { THEME_OPTIONS } from "@/lib/theme";
import { canManage, clampRole, roleLabel, roleOptionLabel } from "@/lib/rbac";
import type { ChatId, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type ThemePref, useUiStore } from "@/stores/ui-store";

const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;
const ROLES: Role[] = ["owner", "member", "guest"];

function SectionLabel({ children, first, onAdd, addLabel }: { children: React.ReactNode; first?: boolean; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className={cn("flex items-center justify-between px-2.5 pb-1.5 text-xs font-semibold tracking-[0.04em] text-sidebar-muted uppercase", first ? "pt-3" : "pt-[18px]")}>
      {children}
      {onAdd && (
        <button type="button" aria-label={addLabel} title={addLabel} onClick={onAdd} className="-my-1 flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-sidebar-hover hover:text-white">
          <PlusIcon className="size-3.5" strokeWidth={2.4} />
        </button>
      )}
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
  const dir = useDirectory();
  const role = useRole();
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

  const me = personOf(dir, dir.me);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState<{ id: string | null } | null>(null);
  const workingAgents = useWorkingAgents();
  const openWorkspace = async (id: string) => {
    if (id === dir.workspace.id) return;
    await switchWorkspace(id);
    clearLocalCache();
    // Full load: every cached query belongs to the old workspace.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/app");
  };
  // You can preview the app as your own role or a lower one.
  const viewAs = ROLES.filter((r) => clampRole(r, dir.role) === r);

  return (
    <nav aria-label="Workspace" className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <PeopleDialog open={peopleOpen} onOpenChange={setPeopleOpen} />
      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} />
      <NewMessageDialog open={dmOpen} onOpenChange={setDmOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AgentDialog agentId={agentOpen?.id ?? null} open={!!agentOpen} onOpenChange={(o) => !o && setAgentOpen(null)} />
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1 py-1.5 text-base font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {dir.workspace.name}
            <ChevronDownIcon className="size-3.5" strokeWidth={2.2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem onSelect={() => setPeopleOpen(true)}>
              <UsersIcon className="size-4 text-muted-foreground" />
              {canManage(dir.role) ? "Invite people" : "People"}
            </DropdownMenuItem>
            {canManage(dir.role) && (
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <SettingsIcon className="size-4 text-muted-foreground" />
                Workspace settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={dir.workspace.id} onValueChange={(id) => void openWorkspace(id)}>
              {dir.memberships.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id}>
                  {m.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <PlusIcon className="size-4 text-muted-foreground" />
                Create a workspace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOutIcon className="size-4 text-muted-foreground" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label="New message"
          onClick={() => setDmOpen(true)}
          className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-hover"
        >
          <SquarePenIcon className="size-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        <SectionLabel first onAdd={dir.role !== "guest" ? () => setCreateOpen(true) : undefined} addLabel="Create a channel">
          Channels
        </SectionLabel>
        {dir.channels.map((id) => {
          const meta = dir.chats[id];
          if (!meta) return null;
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

        <SectionLabel onAdd={dir.role !== "guest" ? () => setAgentOpen({ id: null }) : undefined} addLabel="Add an agent">
          Agents
        </SectionLabel>
        {agentsOf(dir).map((a) => {
          const dm = agentDmOf(dir, a.id);
          const active = !!dm && activeChat === dm;
          const n = dm ? (unread[dm] ?? 0) : 0;
          const working = workingAgents.has(a.id);
          const body = (
            <>
              <span className="relative">
                <Avatar person={personOf(dir, a.id)} size="xs" className="size-5 rounded-[5px] text-2xs" />
                <span
                  aria-hidden
                  className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-sidebar", working ? "animate-pulse bg-sidebar-agent" : "bg-online")}
                />
              </span>
              <span className="flex-1 truncate">{a.name}</span>
              <span className="sr-only">{working ? "working" : "idle"}</span>
              {working ? (
                <span className="text-2xs font-semibold text-sidebar-agent">working</span>
              ) : (
                <span className="rounded border border-sidebar-agent-border px-[5px] py-px text-2xs font-bold tracking-[0.05em] text-sidebar-agent">AGENT</span>
              )}
              {n > 0 && !active && <UnreadBadge n={n} />}
            </>
          );
          return dm ? (
            <NavLink key={a.id} href={`/chat/${dm}`} active={active} bold={n > 0} onNavigate={onNavigate} onClick={() => enterChat(dm)}>
              {body}
            </NavLink>
          ) : (
            <button
              key={a.id}
              type="button"
              onClick={() => setAgentOpen({ id: a.id })}
              className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[15px] text-sidebar-foreground hover:bg-sidebar-hover"
            >
              {body}
            </button>
          );
        })}

        <SectionLabel onAdd={() => setDmOpen(true)} addLabel="New message">
          Direct messages
        </SectionLabel>
        {dir.dms.filter((id) => { const m = dir.chats[id]; return !(m?.kind === "dm" && personOf(dir, m.who).isAgent); }).map((id) => {
          const meta = dir.chats[id];
          if (!meta) return null;
          const p = personOf(dir, meta.kind === "dm" ? meta.who : dir.me);
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
          { href: "/tickets/mine", label: "Assigned to me", count: visible.filter((t) => t.assignee === dir.me).length },
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
            <span className="text-xs text-sidebar-muted">{roleLabel(dir, role)}</span>
          </div>
        </div>
        {viewAs.length > 1 && (
          <>
            <label htmlFor="role-select" className="text-2xs font-semibold tracking-[0.04em] text-sidebar-muted uppercase">
              View as role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="role-select" className="h-9 border-sidebar-input-border bg-sidebar-input text-meta text-white [&_svg]:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {viewAs.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleOptionLabel(dir, r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </nav>
  );
}
