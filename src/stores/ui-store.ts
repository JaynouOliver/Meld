import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_ACCENT } from "@/lib/constants";
import { SEED_UNREAD } from "@/lib/mock/seed";
import { DEFAULT_TICKET_QUERY } from "@/lib/query-language";
import type { ChatId, GroupBy, Role } from "@/lib/types";

export type ThemePref = "light" | "dark" | "system";

/**
 * Client UI state. Server data (messages, tickets) lives in React Query;
 * this store holds only what the user is looking at and their preferences.
 */
export interface Typing {
  chat: ChatId;
  thread: string | null;
  label: string;
}

interface UiState {
  // preferences (persisted)
  role: Role;
  accent: string;
  theme: ThemePref;
  ticketQuery: string;
  groupBy: GroupBy;
  showInsights: boolean;

  // panels
  threadId: string | null;
  ticketId: string | null;

  // live
  typing: Typing | null;
  unread: Partial<Record<ChatId, number>>;
  collapsed: Record<string, boolean>;
  linkKind: "PR" | "Issue";
  /** In-app page views this session; >1 means history.back() stays inside the app. */
  navDepth: number;
  /** A message to jump to (from a citation); consumed by the chat screen. */
  focus: { chatId: ChatId; threadId: string | null; id: string } | null;
  /** Message briefly highlighted after a jump. */
  flashId: string | null;
  /** Chat on screen, for realtime unread counts (set by useRealtimeSync). */
  activeChatForUnread: ChatId | null;
  /** Bumped when the user sends from the main composer, to scroll to their message. */
  sentTick: number;

  setRole: (role: Role) => void;
  setAccent: (accent: string) => void;
  setTheme: (theme: ThemePref) => void;
  setTicketQuery: (q: string) => void;
  setGroupBy: (g: GroupBy) => void;
  setShowInsights: (v: boolean) => void;

  openThread: (id: string) => void;
  closeThread: () => void;
  openTicket: (id: string) => void;
  closeTicket: () => void;

  setTyping: (t: Typing | null) => void;
  markRead: (chat: ChatId) => void;
  bumpUnread: (chat: ChatId) => void;
  toggleCollapsed: (key: string) => void;
  setLinkKind: (k: "PR" | "Issue") => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      role: "owner",
      accent: DEFAULT_ACCENT,
      theme: "system",
      ticketQuery: DEFAULT_TICKET_QUERY,
      groupBy: "assignee",
      showInsights: false,

      // Desktop opens on the design thread (see Providers); phones start clean.
      threadId: null,
      ticketId: null,

      typing: null,
      unread: SEED_UNREAD,
      collapsed: {},
      linkKind: "PR",
      navDepth: 0,
      sentTick: 0,
      activeChatForUnread: null,
      focus: null,
      flashId: null,

      setRole: (role) => set({ role }),
      setAccent: (accent) => set({ accent }),
      setTheme: (theme) => set({ theme }),
      setTicketQuery: (ticketQuery) => set({ ticketQuery }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setShowInsights: (showInsights) => set({ showInsights }),

      openThread: (threadId) => set({ threadId, ticketId: null }),
      closeThread: () => set({ threadId: null }),
      openTicket: (ticketId) => set({ ticketId }),
      closeTicket: () => set({ ticketId: null }),

      setTyping: (typing) => set({ typing }),
      markRead: (chat) => set((s) => ({ unread: { ...s.unread, [chat]: 0 } })),
      bumpUnread: (chat) => set((s) => ({ unread: { ...s.unread, [chat]: (s.unread[chat] ?? 0) + 1 } })),
      toggleCollapsed: (key) => set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      setLinkKind: (linkKind) => set({ linkKind }),
    }),
    {
      name: "meld-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ role: s.role, accent: s.accent, theme: s.theme, ticketQuery: s.ticketQuery, groupBy: s.groupBy, showInsights: s.showInsights }),
      // v1: Cobalt replaced the old blue, and violet became Atlas-only.
      // v2: theme defaults to following the system (v1 saved "light" without a way to change it).
      version: 2,
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<UiState>;
        if (version < 1 && (!s.accent || ["#2F6FEB", "#7C3AED"].includes(s.accent.toUpperCase()))) s.accent = DEFAULT_ACCENT;
        if (version < 2) s.theme = "system";
        return s as UiState;
      },
      // Rehydrated in <Providers> after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
