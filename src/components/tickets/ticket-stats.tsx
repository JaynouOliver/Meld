import { isOpen } from "@/lib/constants";
import type { Ticket } from "@/lib/types";

export function TicketStats({ tickets }: { tickets: Ticket[] }) {
  const stats = [
    { label: "Open", short: "Open", value: tickets.filter((t) => isOpen(t.status)).length, sub: "To do, in progress, in review" },
    { label: "In review", short: "Review", value: tickets.filter((t) => t.status === "In review").length, sub: "Waiting on a reviewer" },
    { label: "Done", short: "Done", value: tickets.filter((t) => t.status === "Done").length, sub: "Closed tickets" },
    { label: "Filed by Atlas", short: "By Atlas", value: tickets.filter((t) => t.reporter === "atlas").length, sub: "Created from chat" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 rounded-[10px] border bg-white px-2.5 py-2 sm:px-3.5 sm:py-3">
          <span className="order-2 truncate text-[11px] font-semibold text-muted-foreground sm:order-none sm:text-xs">
            <span className="sm:hidden">{s.short}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </span>
          <span className="order-1 text-xl font-bold tracking-[-0.01em] sm:order-none sm:text-[26px]">{s.value}</span>
          <span className="hidden text-xs text-muted-foreground sm:block">{s.sub}</span>
        </div>
      ))}
    </div>
  );
}
