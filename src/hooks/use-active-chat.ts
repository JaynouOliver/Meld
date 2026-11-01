"use client";

import { useParams, usePathname } from "next/navigation";

import { isChatId } from "@/lib/constants";
import type { ChatId } from "@/lib/types";

/** The chat in the URL, or null when on another screen. */
export function useActiveChat(): ChatId | null {
  const params = useParams<{ chatId?: string }>();
  const pathname = usePathname();
  if (!pathname.startsWith("/chat/")) return null;
  const id = params.chatId;
  return id && isChatId(id) ? id : null;
}
