import { TicketsScreen } from "@/components/tickets/tickets-screen";

export const metadata = { title: "Assigned to me" };

export default function MyTicketsPage() {
  return <TicketsScreen scope="mine" />;
}
