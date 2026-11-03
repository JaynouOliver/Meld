"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, type Persister } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { CACHE_KEY } from "@/lib/cache";
import { useUiStore } from "@/stores/ui-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  // The workspace's data is saved in this browser, so reopening Meld shows chats and
  // tickets at once while fresh data loads in the background (stale-while-revalidate).
  const [persister] = useState<Persister>(() =>
    typeof window === "undefined" || process.env.NEXT_PUBLIC_DATA_MODE === "local"
      ? NO_PERSIST
      : createSyncStoragePersister({ storage: window.localStorage, key: CACHE_KEY, throttleTime: 1000 }),
  );

  useEffect(() => {
    useUiStore.persist.rehydrate();
  }, []);

  // Workspace accent drives the brand color everywhere (buttons, active nav, charts).
  const accent = useUiStore((s) => s.accent);
  useEffect(() => {
    document.documentElement.style.setProperty("--brand", accent);
  }, [accent]);

  // Light / dark / follow the OS.
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 3600_000,
        buster: "v1",
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && PERSISTED.has(String(q.queryKey[0])) },
      }}
    >
      <TooltipProvider>{children}</TooltipProvider>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  );
}

/** Workspace data worth keeping between visits (not live run status). */
const PERSISTED = new Set(["directory", "tickets", "week", "messages"]);
const NO_PERSIST: Persister = { persistClient: async () => {}, restoreClient: async () => undefined, removeClient: async () => {} };
