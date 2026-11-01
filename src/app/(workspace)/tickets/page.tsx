import { TicketsScreen } from "@/components/tickets/tickets-screen";

export const metadata = { title: "All tickets" };

export default function TicketsPage() {
  return <TicketsScreen scope="all" />;
}
