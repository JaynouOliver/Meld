import type { Priority, TicketStatus } from "./types";

export const STATUSES: TicketStatus[] = ["To do", "In progress", "In review", "Done", "Backburner"];
export const STATUS_ORDER: TicketStatus[] = ["To do", "In progress", "In review", "Backburner", "Done"];
export const OPEN_STATUSES: TicketStatus[] = ["To do", "In progress", "In review"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

/**
 * [background, text, border, dot] for each status, as CSS variables (see globals.css).
 * Violet is never used here: it belongs to Atlas.
 */
const statusVars = (k: string): [string, string, string, string] => [
  `var(--status-${k}-bg)`,
  `var(--status-${k}-fg)`,
  `var(--status-${k}-line)`,
  `var(--status-${k}-dot)`,
];
export const STATUS_COLORS: Record<TicketStatus, [string, string, string, string]> = {
  "To do": statusVars("todo"),
  "In progress": statusVars("progress"),
  "In review": statusVars("review"),
  Done: statusVars("done"),
  Backburner: statusVars("later"),
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  High: "var(--priority-high)",
  Medium: "var(--priority-medium)",
  Low: "var(--priority-low)",
};

export const DEFAULT_ACCENT = "#2952E3";

/** Workspace accents. All pass 4.5:1 with white text. Violet is reserved for Atlas. */
export const ACCENTS = [
  { value: DEFAULT_ACCENT, label: "Cobalt" },
  { value: "#0F766E", label: "Teal" },
  { value: "#374154", label: "Graphite" },
  { value: "#C2410C", label: "Orange" },
] as const;

export function isOpen(status: TicketStatus) {
  return OPEN_STATUSES.includes(status);
}
