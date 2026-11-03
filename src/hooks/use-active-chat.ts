"use client";

import { useParams, usePathname } from "next/navigation";

import type { ChatId } from "@/lib/types";

/** The chat in the URL, or null when on another screen. */
export function useActiveChat(): ChatId | null {
  const params = useParams<{ chatId?: string }>();
  const pathname = usePathname();
  if (!pathname.startsWith("/chat/")) return null;
  return params.chatId ?? null;
}
