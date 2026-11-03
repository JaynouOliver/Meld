"use client";

import { useEffect } from "react";

import { ThreadPanel } from "@/components/thread/thread-panel";
import { useMessages } from "@/hooks/use-messages";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

// The design's first frame shows the invite thread open. Recreate that once, on desktop only.
let seededThread = false;

export function ChatScreen({ chatId }: { chatId: ChatId }) {
  const { data: messages } = useMessages(chatId);
  const threadId = useUiStore((s) => s.threadId);
  const ticketId = useUiStore((s) => s.ticketId);
  const markRead = useUiStore((s) => s.markRead);

  useEffect(() => markRead(chatId), [chatId, markRead]);
  // Jump to a cited message once this chat's messages are loaded.
  const focus = useUiStore((s) => s.focus);
  const loaded = !!messages;
  useEffect(() => {
    if (!focus || focus.chatId !== chatId || !loaded) return;
    const ui = useUiStore.getState();
    if (focus.threadId) ui.openThread(focus.threadId);
    useUiStore.setState({ focus: null, flashId: focus.id });
  }, [focus, chatId, loaded, messages]);

  // Leaving the chat closes its thread, so it doesn't reappear on return.
  useEffect(() => () => useUiStore.getState().closeThread(), [chatId]);
  useEffect(() => {
    if (seededThread) return;
    seededThread = true;
    if (chatId === "design" && window.matchMedia("(min-width: 1280px)").matches) useUiStore.getState().openThread("m2");
  }, [chatId]);

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
