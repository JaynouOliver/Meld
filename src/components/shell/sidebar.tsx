"use client";

import { BookmarkIcon, ChevronDownIcon, FlagIcon, HashIcon, ListChecksIcon, LogOutIcon, MonitorIcon, MoonIcon, PlusIcon, SearchIcon, SettingsIcon, SquarePenIcon, SunIcon, TicketIcon, UsersIcon } from "lucide-react";
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
import { useMissions, useOpenDecisions } from "@/hooks/use-missions";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { switchWorkspace } from "@/lib/api/remote";
import { clearLocalCache } from "@/lib/cache";
import { signOut } from "@/lib/auth/browser";
import { CreateChannelDialog, NewMessageDialog } from "@/components/workspace/channel-dialogs";
import { PeopleDialog } from "@/components/workspace/people-dialog";
import { AgentDialog } from "@/components/agents/agent-dialog";
import { useWorkingAgents } from "@/hooks/use-agent-runs";
import { SettingsDialog } from "@/components/workspace/settings-dialog";
import { openSearch } from "./search-palette";
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
    <div className={cn("flex items-center justify-between px-2 pb-1 text-xs font-medium text-sidebar-muted", first ? "pt-2" : "pt-4")}>
      {children}
      {onAdd && (
        <button type="button" aria-label={addLabel} title={addLabel} onClick={onAdd} className="-my-1 flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-sidebar-hover hover:text-sidebar-strong">
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
        "flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 py-1 text-sm no-underline transition-colors",
        active
          ? "bg-sidebar-active font-semibold text-sidebar-strong hover:text-sidebar-strong"
          : cn("hover:bg-sidebar-hover", bold ? "font-semibold text-sidebar-strong hover:text-sidebar-strong" : "text-sidebar-foreground hover:text-sidebar-foreground"),
      )}
    >
      {children}
    </Link>
  );
}

function UnreadBadge({ n }: { n: number }) {
  return (
    <span className="tabular flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-unread px-1 text-2xs font-semibold text-white">
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
  const { data: missions } = useMissions();
  const { data: needsYou } = useOpenDecisions();
  const liveMissions = missions?.filter((m) => m.status !== "done" && m.status !== "canceled").length ?? 0;

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
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold text-sidebar-strong outline-none hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden className="flex size-6 items-center justify-center rounded-[5px] bg-sidebar-strong text-xs font-bold text-sidebar">
              {dir.workspace.name.slice(0, 1).toUpperCase()}
            </span>
            {dir.workspace.name}
            <ChevronDownIcon className="size-3.5 text-sidebar-muted" strokeWidth={2.2} />
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
        <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Search (Ctrl+K)"
          title="Search  ⌘K"
          onClick={openSearch}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-sidebar-border bg-sidebar-input text-sidebar-foreground hover:text-sidebar-strong"
        >
          <SearchIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="New message"
          onClick={() => setDmOpen(true)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-sidebar-border bg-sidebar-input text-sidebar-foreground hover:text-sidebar-strong"
        >
          <SquarePenIcon className="size-4" />
        </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-3">
        <div className="pt-2">
          <NavLink href="/missions" active={pathname.startsWith("/missions")} onNavigate={onNavigate} onClick={() => useUiStore.setState({ threadId: null })}>
            <FlagIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
            <span className="flex-1">Missions</span>
            {needsYou?.length ? (
              <span title={`${needsYou.length} decision${needsYou.length === 1 ? "" : "s"} waiting on a person`} className="rounded-sm border border-[var(--status-review-line)] px-1 text-2xs font-semibold text-[var(--status-review-fg)]">
                Needs you · {needsYou.length}
              </span>
            ) : (
              liveMissions > 0 && <span className="tabular text-xs text-sidebar-muted">{liveMissions}</span>
            )}
          </NavLink>
          <NavLink href="/decisions" active={pathname.startsWith("/decisions")} onNavigate={onNavigate} onClick={() => useUiStore.setState({ threadId: null })}>
            <BookmarkIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
            <span className="flex-1">Decisions</span>
          </NavLink>
          <NavLink href="/playbooks" active={pathname.startsWith("/playbooks")} onNavigate={onNavigate} onClick={() => useUiStore.setState({ threadId: null })}>
            <ListChecksIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
            <span className="flex-1">Playbooks</span>
          </NavLink>
          <NavLink href="/people" active={pathname.startsWith("/people")} onNavigate={onNavigate} onClick={() => useUiStore.setState({ threadId: null })}>
            <UsersIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
            <span className="flex-1">People</span>
            <span className="tabular text-xs text-sidebar-muted">{Object.keys(dir.people).length}</span>
          </NavLink>
        </div>
        <SectionLabel onAdd={dir.role !== "guest" ? () => setCreateOpen(true) : undefined} addLabel="Create a channel">
          Channels
        </SectionLabel>
        {dir.channels.map((id) => {
          const meta = dir.chats[id];
          if (!meta) return null;
          const active = activeChat === id;
          const n = unread[id] ?? 0;
          return (
            <NavLink key={id} href={`/chat/${id}`} active={active} bold={n > 0} onNavigate={onNavigate} onClick={() => enterChat(id)}>
              <HashIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
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
                <Avatar person={personOf(dir, a.id)} size="xs" className="size-5 rounded-[4px] text-[10px]" />
                <span
                  aria-hidden
                  className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-sidebar", working ? "animate-pulse bg-brand" : "bg-online")}
                />
              </span>
              <span className="flex-1 truncate">{a.name}</span>
              <span className="sr-only">{working ? "working" : "idle"}</span>
              {working ? (
                <span className="text-2xs font-medium text-sidebar-muted">Working</span>
              ) : (
                <span className="rounded-sm border border-sidebar-agent-border px-1 text-2xs leading-4 font-medium text-sidebar-agent">Agent</span>
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
              className="flex min-h-[30px] w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-sidebar-foreground hover:bg-sidebar-hover"
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
              <Avatar person={p} size="xs" presence className="size-5 rounded-[4px] text-[10px]" ringClassName="border-sidebar" />
              <span className="flex-1 truncate">{p.name}</span>
              {p.isAgent && (
                <span className="rounded-sm border border-sidebar-agent-border px-1 text-2xs leading-4 font-medium text-sidebar-agent">Agent</span>
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
            <TicketIcon aria-hidden className="size-4 w-5 text-sidebar-muted" />
            <span className="flex-1">{n.label}</span>
            <span className="tabular text-xs text-sidebar-muted">{n.count}</span>
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-sidebar-border px-3 pt-3 pb-3">
        {/* Your page: profile, reminders, preferences. */}
        <Link href="/me" onClick={onNavigate} data-press title="Your profile, reminders and preferences" className="-m-1 flex items-center gap-2.5 rounded-md p-1 hover:bg-sidebar-hover">
          <Avatar person={me} size="lg" presence className="rounded-md text-xs" ringClassName="border-sidebar size-2.5" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-strong">{me.name}</span>
            <span className="text-xs text-sidebar-muted">{roleLabel(dir, role)}</span>
          </div>
        </Link>
        {viewAs.length > 1 && (
          <>
            <label htmlFor="role-select" className="text-xs font-medium text-sidebar-muted">
              View as role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="role-select" className="h-8 border-sidebar-input-border bg-sidebar-input text-[13px] text-sidebar-strong [&_svg]:text-sidebar-muted">
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
