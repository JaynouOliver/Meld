"use client";

import { SendIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { PanelHeader, SidePanel } from "@/components/shell/side-panel";
import { useSendMessage } from "@/hooks/use-messages";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { CHAT_META, PEOPLE } from "@/lib/constants";
import { countReplies } from "@/lib/text";
import type { ChatId, Message } from "@/lib/types";
import { useUiStore } from "@/stores/ui-store";
import { ThreadNodes } from "./thread-nodes";

export function ThreadPanel({ chatId, root }: { chatId: ChatId; root: Message }) {
  const closeThread = useUiStore((s) => s.closeThread);
  const typing = useUiStore((s) => s.typing);
  const [draft, setDraft] = useState("");
  const send = useSendMessage();
  const { scrollRef, contentRef, pin } = useStickToBottom(root.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = CHAT_META[chatId];
  const p = PEOPLE[root.who];
  const n = countReplies(root.replies);
  const showTyping = typing && typing.thread === root.id;

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
      <PanelHeader onClose={closeThread} closeLabel="Close thread">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[17px] font-bold">Thread</h2>
          <span className="truncate text-[13px] text-muted-foreground">{meta.kind === "channel" ? `# ${meta.label}` : PEOPLE[meta.who].name}</span>
        </div>
      </PanelHeader>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        <div ref={contentRef}>
        <div className="flex gap-3 px-4 pt-1 pb-2 sm:px-5">
          <Avatar person={p} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold">{p.name}</span>
              <span className="text-xs text-muted-foreground">{root.time}</span>
            </div>
            <RichText text={root.text} className="mt-0.5 text-[15px] leading-[1.6]" />
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-2">
          <span className="text-[13px] whitespace-nowrap text-muted-foreground">
            {n === 0 ? "No replies yet" : n === 1 ? "1 reply" : `${n} replies`}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ThreadNodes chatId={chatId} rootId={root.id} nodes={root.replies} depth={0} />
        {showTyping && <div className="px-5 pt-1.5 pl-[68px] text-[13px] text-muted-foreground italic">{typing.label}</div>}
        </div>
      </div>

      <div className="px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5 sm:pt-0 sm:pb-5">
        <div className="flex items-center gap-2 rounded-[10px] border border-input py-1.5 pr-1.5 pl-3.5 focus-within:border-[#8B95A5]">
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
            placeholder="Reply… (@Atlas and NW- IDs work)"
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent py-[9px] text-base outline-none placeholder:text-muted-foreground md:text-[15px]"
          />
          <button
            type="button"
            onClick={submit}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Send reply"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-brand text-white hover:opacity-90"
          >
            <SendIcon className="size-[18px]" />
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
