import { Suspense } from "react";

import { ChatScreen } from "@/components/chat/chat-screen";

export const metadata = { title: "Chat" };

/**
 * Chat ids are created at runtime, so the param is request data: with Cache Components
 * it has to be read inside a Suspense boundary. ChatScreen handles unknown ids.
 */
export default function ChatPage({ params }: PageProps<"/chat/[chatId]">) {
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      {params.then(({ chatId }) => (
        <ChatScreen chatId={chatId} />
      ))}
    </Suspense>
  );
}
