"use client";

import { useEffect } from "react";

import { ThreadPanel } from "@/components/thread/thread-panel";
import { useMessages } from "@/hooks/use-messages";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";

export function ChatScreen({ chatId }: { chatId: ChatId }) {
  const { data: messages } = useMessages(chatId);
  const threadId = useUiStore((s) => s.threadId);
  const ticketId = useUiStore((s) => s.ticketId);
  const markRead = useUiStore((s) => s.markRead);

  useEffect(() => markRead(chatId), [chatId, markRead]);

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
