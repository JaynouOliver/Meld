import type { ChatId } from "@/lib/types";

export const queryKeys = {
  messages: (chatId: ChatId) => ["messages", chatId] as const,
  allMessages: ["messages"] as const,
  tickets: ["tickets"] as const,
  week: ["week"] as const,
  agentRuns: ["agent-runs"] as const,
  directory: ["directory"] as const,
  missions: ["missions"] as const,
  mission: (id: string) => ["missions", id] as const,
  decisions: ["decisions"] as const,
  teamDecisions: ["team-decisions"] as const,
};
