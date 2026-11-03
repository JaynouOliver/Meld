"use client";

import { Avatar } from "@/components/common/avatar";
import { ScreenHeader } from "@/components/shell/screen-header";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { ATLAS_ID, personOf } from "@/lib/directory";
import { roleLabel } from "@/lib/rbac";
import type { ChatId } from "@/lib/types";

export function ChatHeader({ chatId }: { chatId: ChatId }) {
  const dir = useDirectory();
  const meta = dir.chats[chatId];
  const role = useRole();
  if (!meta) return null;

  if (meta.kind === "dm") {
    const p = personOf(dir, meta.who);
    const topic = meta.who === ATLAS_ID ? `Agent · works on tickets with your permissions (${roleLabel(dir, role)})` : meta.topic;
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
              <Avatar key={k} person={personOf(dir, k)} size="sm" className="-ml-1 rounded-md border-2 border-white" />
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
