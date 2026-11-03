import type { AgentMode } from "@/lib/types";

/** How an agent behaves in a channel, in the UI's words. */
export const MODE_OPTIONS: { value: AgentMode | "off"; label: string; hint: string }[] = [
  { value: "off", label: "Not in channel", hint: "Can't read it" },
  { value: "mention", label: "When tagged", hint: "Reads the channel, replies only when @mentioned" },
  { value: "lurk", label: "Lurker", hint: "Reads along, speaks up on questions, bugs and blockers" },
  { value: "active", label: "Active", hint: "Chimes in whenever it can help" },
];

export const modeLabel = (m: AgentMode | "off" | null) => MODE_OPTIONS.find((o) => o.value === (m ?? "off"))?.label ?? "Not in channel";
