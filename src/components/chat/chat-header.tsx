"use client";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { CHAT_META, PEOPLE } from "@/lib/constants";
import { ROLE_LABEL } from "@/lib/rbac";
import type { ChatId } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";

export function ChatHeader({ chatId }: { chatId: ChatId }) {
  const meta = CHAT_META[chatId];
  const role = useUiStore((s) => s.role);

  if (meta.kind === "dm") {
    const p = PEOPLE[meta.who];
    const topic = meta.who === "atlas" ? `Agent · works on tickets with your permissions (${ROLE_LABEL[role]})` : meta.topic;
    return (
      <ScreenHeader back="/home">
        <Avatar person={p} size="md" />
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="truncate text-base font-bold">{p.name}</h1>
          <span className="truncate text-meta text-muted-foreground">{topic}</span>
        </div>
      </ScreenHeader>
    );
  }

  return (
    <ScreenHeader
      back="/home"
      actions={
        <div title="Channel members" className="flex shrink-0 items-center gap-2 rounded-lg border py-1 pr-2.5 pl-1.5">
          <span aria-hidden className="flex pl-1 max-[360px]:hidden">
            {meta.members.slice(0, 3).map((k) => (
              <Avatar key={k} person={PEOPLE[k]} size="sm" className="-ml-1 rounded-md border-2 border-white" />
            ))}
          </span>
          <span className="text-meta font-semibold text-ink-2">{meta.members.length}</span>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col leading-[1.3]">
        <h1 className="truncate text-base font-bold"># {meta.label}</h1>
        <span className="truncate text-meta text-muted-foreground">{meta.topic}</span>
      </div>
    </ScreenHeader>
  );
}
