import { notFound } from "next/navigation";

import { ChatScreen } from "@/components/chat/chat-screen";
import { CHAT_META, isChatId } from "@/lib/constants";

export function generateStaticParams() {
  return Object.keys(CHAT_META).map((chatId) => ({ chatId }));
}

export async function generateMetadata(props: PageProps<"/chat/[chatId]">) {
  const { chatId } = await props.params;
  if (!isChatId(chatId)) return {};
  const meta = CHAT_META[chatId];
  return { title: meta.kind === "channel" ? `#${meta.label}` : meta.who === "atlas" ? "Atlas" : "Direct message" };
}

export default async function ChatPage(props: PageProps<"/chat/[chatId]">) {
  const { chatId } = await props.params;
  if (!isChatId(chatId)) notFound();
  return <ChatScreen chatId={chatId} />;
}
