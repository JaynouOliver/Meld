import { createRoot } from "react-dom/client";

import { ChatScreen } from "@/components/chat/chat-screen";
import { HomeScreen } from "@/components/home/home-screen";
import { MeScreen } from "@/components/me/me-screen";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { TicketsScreen } from "@/components/tickets/tickets-screen";
import { isChatId } from "@/lib/constants";
import { useRouter } from "./router";

/** Preview entry: the real app components, routed by hash instead of Next's router. */
function Screen() {
  const path = useRouter((s) => s.path);
  if (path === "/tickets/mine") return <TicketsScreen scope="mine" />;
  if (path === "/tickets") return <TicketsScreen scope="all" />;
  if (path === "/home") return <HomeScreen />;
  if (path === "/me") return <MeScreen />;
  const id = path.split("/")[2] ?? "design";
  const chatId = isChatId(id) ? id : "design";
  return <ChatScreen key={chatId} chatId={chatId} />;
}

createRoot(document.getElementById("root")!).render(
  <Providers>
    <AppShell>
      <Screen />
    </AppShell>
  </Providers>,
);
