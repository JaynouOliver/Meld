"use client";

import { SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { MembersButton } from "@/components/people/members-button";
import { ChannelSettingsDialog, useCanEditChannel } from "@/components/workspace/channel-dialogs";
import { CatchUpButton } from "./catch-up-button";
import { PinnedButton } from "./pinned-button";
import { ChannelAgents } from "@/components/agents/channel-agents";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SearchButton } from "@/components/shell/search-palette";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { ATLAS_ID, personOf } from "@/lib/directory";
import { roleLabel } from "@/lib/rbac";
import type { ChatId } from "@/lib/types";

export function ChatHeader({ chatId }: { chatId: ChatId }) {
  const dir = useDirectory();
  const meta = dir.chats[chatId];
  const role = useRole();
  const canEdit = useCanEditChannel(chatId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!meta) return null;

  if (meta.kind === "dm") {
    const p = personOf(dir, meta.who);
    const topic = meta.who === ATLAS_ID ? `Agent · works on tickets with your permissions (${roleLabel(dir, role)})` : meta.topic;
    return (
      <ScreenHeader
        back="/home"
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <SearchButton className="size-8 border border-input text-muted-foreground [&_svg]:size-4" />
            <PinnedButton chatId={chatId} />
            {meta.who === ATLAS_ID && <CatchUpButton compact className="max-sm:hidden" />}
          </div>
        }
      >
        <button type="button" data-profile={p.id} aria-label={`${p.name}'s profile`} className="cursor-pointer rounded-[6px]">
          <Avatar person={p} size="md" />
        </button>
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <h1 className="truncate text-[15px] font-semibold">
            <button type="button" data-profile={p.id} className="cursor-pointer hover:underline">{p.name}</button>
          </h1>
          <span className="truncate text-meta text-muted-foreground">{topic}</span>
        </div>
      </ScreenHeader>
    );
  }

  return (
    <ScreenHeader
      back="/home"
      actions={
        <div className="flex shrink-0 items-center gap-2">
        <SearchButton className="size-8 border border-input text-muted-foreground [&_svg]:size-4" />
        <PinnedButton chatId={chatId} />
        <ChannelAgents chatId={chatId} />
        {canEdit && (
          <>
            <button type="button" aria-label="Channel settings" title="Channel settings" onClick={() => setSettingsOpen(true)} className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground">
              <SettingsIcon className="size-4" />
            </button>
            <ChannelSettingsDialog key={`${chatId}-${meta.label}`} chatId={chatId} open={settingsOpen} onOpenChange={setSettingsOpen} />
          </>
        )}
        <MembersButton chatId={chatId} />
        </div>
      }
    >
      <div className="flex min-w-0 flex-col leading-[1.3]">
        <h1 className="truncate text-[15px] font-semibold"># {meta.label}</h1>
        <span className="truncate text-meta text-muted-foreground">{meta.topic}</span>
      </div>
    </ScreenHeader>
  );
}
