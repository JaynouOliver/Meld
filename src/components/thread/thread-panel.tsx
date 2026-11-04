"use client";

import { SendIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { MessageBody, MessageToolbar, PinnedLabel, TouchActions } from "@/components/chat/message-actions";
import { DeletedAvatar, MessageReactions } from "@/components/chat/reactions";
import { PanelHeader, SidePanel } from "@/components/shell/side-panel";
import { useDirectory } from "@/hooks/use-directory";
import { useSendMessage } from "@/hooks/use-messages";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { personOf } from "@/lib/directory";
import { countReplies } from "@/lib/text";
import type { ChatId, Message } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { AtlasLive } from "@/components/chat/atlas-live";
import { ThreadNodes } from "./thread-nodes";
import { SummarizeButton } from "./summarize-button";

export function ThreadPanel({ chatId, root }: { chatId: ChatId; root: Message }) {
  const closeThread = useUiStore((s) => s.closeThread);
  const typing = useUiStore((s) => s.typing);
  const [draft, setDraft] = useState("");
  const [editingRoot, setEditingRoot] = useState(false);
  const send = useSendMessage();
  const { scrollRef, contentRef, pin } = useStickToBottom(root.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const dir = useDirectory();
  const meta = dir.chats[chatId];
  const p = personOf(dir, root.who);
  const n = countReplies(root.replies);
  const typingLabel = typing && typing.thread === root.id ? typing.label : null;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    send.mutate({ chatId, text, threadId: root.id });
    setDraft("");
    pin();
    inputRef.current?.focus();
  };

  return (
    <SidePanel label="Thread" width="thread" onClose={closeThread}>
      <PanelHeader onClose={closeThread} closeLabel="Close thread" actions={<SummarizeButton chatId={chatId} threadId={root.id} disabled={n === 0} />}>
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">Thread</h2>
          <span className="truncate text-meta text-muted-foreground">{!meta ? "" : meta.kind === "channel" ? `# ${meta.label}` : personOf(dir, meta.who).name}</span>
        </div>
      </PanelHeader>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 [overflow-anchor:none]">
        <div ref={contentRef}>
        <div className="group relative flex gap-3 px-4 pt-1 pb-2 sm:px-5">
          {root.deletedAt ? <DeletedAvatar /> : <Avatar person={p} size="xl" />}
          <div className="min-w-0 flex-1">
            <PinnedLabel node={root} />
            {!root.deletedAt && (
              <div className="flex items-baseline gap-2">
                <span className="text-body font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground">{root.time}</span>
              </div>
            )}
            <MessageBody chatId={chatId} node={root} editing={editingRoot} onDone={() => setEditingRoot(false)} />
            <MessageReactions chatId={chatId} node={root} />
          </div>
          {!editingRoot && <TouchActions chatId={chatId} node={root} onEdit={() => setEditingRoot(true)} />}
          {!editingRoot && <MessageToolbar chatId={chatId} node={root} onEdit={() => setEditingRoot(true)} className="-top-2 right-4 sm:right-5" />}
        </div>
        <div className="flex items-center gap-3 px-5 py-2">
          <span className="text-meta whitespace-nowrap text-muted-foreground">
            {n === 0 ? "No replies yet" : n === 1 ? "1 reply" : `${n} replies`}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ThreadNodes chatId={chatId} nodes={root.replies} />
        <AtlasLive chatId={chatId} threadId={root.id} className="px-4 sm:px-5" />
        {typingLabel && <div className="px-5 pt-1.5 pl-[68px] text-meta text-muted-foreground italic">{typingLabel}</div>}
        </div>
      </div>

      <div className="px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5 sm:pt-0 sm:pb-4">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background p-1 pl-3 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <label htmlFor="thread-input" className="sr-only">
            Reply in thread
          </label>
          <input
            id="thread-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Reply… (@Atlas and ${dir.workspace.ticketPrefix}- IDs work)`}
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent py-[7px] text-base outline-none placeholder:text-muted-foreground md:text-body"
          />
          <button
            type="button"
            onClick={submit}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Send reply"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[5px] bg-brand text-white hover:opacity-90 md:size-8"
          >
            <SendIcon className="size-4" />
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
