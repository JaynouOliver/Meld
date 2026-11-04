"use client";

import * as api from "@/lib/api";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { ThreadPanel } from "@/components/thread/thread-panel";
import { useDirectory } from "@/hooks/use-directory";
import { loadAround } from "@/hooks/use-chat-history";
import { useMessages } from "@/hooks/use-messages";
import { resolveFocus } from "@/lib/chat-history";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

// The design's first frame shows the invite thread open. Recreate that once, on desktop only,
// in the sample workspace.
let seededThread = false;

export function ChatScreen({ chatId }: { chatId: ChatId }) {
  const dir = useDirectory();
  const exists = chatId in dir.chats;
  const { data: messages } = useMessages(exists ? chatId : null);
  const threadId = useUiStore((s) => s.threadId);
  const ticketId = useUiStore((s) => s.ticketId);
  const markRead = useUiStore((s) => s.markRead);

  useEffect(() => markRead(chatId), [chatId, markRead]);
  // Tell the server too, when opening the chat and when leaving it, so Atlas's
  // "what did I miss?" starts from here. Best effort.
  useEffect(() => {
    const save = () => void api.markRead(chatId).catch(() => {});
    save();
    return save;
  }, [chatId]);
  // Jump to a cited, searched or pinned message once this chat's messages are loaded.
  // Older than the loaded window: fetch the conversation around it first.
  const focus = useUiStore((s) => s.focus);
  const qc = useQueryClient();
  const fetching = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focus.chatId !== chatId || !messages) return;
    const r = resolveFocus(messages, focus);
    if (r.status === "missing") {
      if (fetching.current === focus.id) return;
      fetching.current = focus.id;
      const drop = () => useUiStore.setState((s) => (s.focus?.id === focus.id ? { focus: null } : s));
      void loadAround(qc, chatId, focus.id)
        .then((found) => !found && drop(), drop)
        .finally(() => {
          if (fetching.current === focus.id) fetching.current = null;
        });
      return;
    }
    if (r.threadId) useUiStore.getState().openThread(r.threadId);
    useUiStore.setState({ focus: null, flashId: focus.id });
  }, [focus, chatId, messages, qc]);

  // Leaving the chat closes its thread, so it doesn't reappear on return.
  useEffect(() => () => useUiStore.getState().closeThread(), [chatId]);
  useEffect(() => {
    if (seededThread) return;
    seededThread = true;
    if (dir.demo && chatId === dir.home && window.matchMedia("(min-width: 1280px)").matches) useUiStore.getState().openThread("m2");
  }, [chatId, dir.demo, dir.home]);

  if (!exists) return <MissingChat home={dir.home} />;

  const root = messages?.find((m) => m.id === threadId) ?? null;

  return (
    <>
      <main className="flex min-w-0 flex-[999_1_480px] flex-col bg-background">
        <ChatHeader chatId={chatId} />
        <MessageList chatId={chatId} messages={messages} />
        <Composer key={chatId} chatId={chatId} />
      </main>
      {root && !ticketId && <ThreadPanel chatId={chatId} root={root} />}
    </>
  );
}

/** A chat id that isn't in this workspace (deleted channel, stale link). */
function MissingChat({ home }: { home: ChatId }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <p className="text-body font-semibold text-foreground">This channel doesn&apos;t exist or was deleted</p>
      <Link href={`/chat/${home}`} className="text-sm text-link underline-offset-4 hover:underline">
        Go to your workspace&apos;s home channel
      </Link>
    </main>
  );
}
