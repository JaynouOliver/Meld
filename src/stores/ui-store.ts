import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { SEED_UNREAD } from "@/lib/mock/seed";
import { DEFAULT_TICKET_QUERY } from "@/lib/query-language";
import type { ChatId, GroupBy, Role } from "@/lib/types";

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
  ticketQuery: string;
  groupBy: GroupBy;

  // panels
  threadId: string | null;
  replyTo: string | null;
  expanded: Record<string, boolean>;
  ticketId: string | null;

  // live
  typing: Typing | null;
  unread: Partial<Record<ChatId, number>>;
  collapsed: Record<string, boolean>;
  linkKind: "PR" | "Issue";

  setRole: (role: Role) => void;
  setAccent: (accent: string) => void;
  setTicketQuery: (q: string) => void;
  setGroupBy: (g: GroupBy) => void;

  openThread: (id: string) => void;
  closeThread: () => void;
  setReplyTo: (id: string | null) => void;
  setExpanded: (id: string, open: boolean) => void;
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
      accent: "#2F6FEB",
      ticketQuery: DEFAULT_TICKET_QUERY,
      groupBy: "assignee",

      // Desktop opens on the design thread (see Providers); phones start clean.
      threadId: null,
      replyTo: null,
      expanded: { r1: true, s2: true, s3: true },
      ticketId: null,

      typing: null,
      unread: SEED_UNREAD,
      collapsed: {},
      linkKind: "PR",

      setRole: (role) => set({ role }),
      setAccent: (accent) => set({ accent }),
      setTicketQuery: (ticketQuery) => set({ ticketQuery }),
      setGroupBy: (groupBy) => set({ groupBy }),

      openThread: (threadId) => set({ threadId, replyTo: null, ticketId: null }),
      closeThread: () => set({ threadId: null, replyTo: null }),
      setReplyTo: (replyTo) =>
        set((s) => ({ replyTo, expanded: replyTo ? { ...s.expanded, [replyTo]: true } : s.expanded })),
      setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
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
      partialize: (s) => ({ role: s.role, accent: s.accent, ticketQuery: s.ticketQuery, groupBy: s.groupBy }),
      // Rehydrated in <Providers> after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
