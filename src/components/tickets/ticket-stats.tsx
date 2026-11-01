import { isOpen } from "@/lib/constants";
import type { Ticket } from "@/lib/types";

export function TicketStats({ tickets }: { tickets: Ticket[] }) {
  const stats = [
    { label: "Open", value: tickets.filter((t) => isOpen(t.status)).length, sub: "To do, in progress, in review" },
    { label: "In review", value: tickets.filter((t) => t.status === "In review").length, sub: "Waiting on a reviewer" },
    { label: "Done", value: tickets.filter((t) => t.status === "Done").length, sub: "Closed tickets" },
    { label: "Filed by Atlas", value: tickets.filter((t) => t.reporter === "atlas").length, sub: "Created from chat" },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 rounded-[10px] border bg-white px-3.5 py-3">
          <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
          <span className="text-[26px] font-bold tracking-[-0.01em]">{s.value}</span>
          <span className="text-xs text-muted-foreground">{s.sub}</span>
        </div>
      ))}
    </div>
  );
}
