"use client";

import { ChevronRightIcon, ReplyIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { RichText } from "@/components/common/rich-text";
import { useSendMessage } from "@/hooks/use-messages";
import { PEOPLE } from "@/lib/constants";
import { countReplies } from "@/lib/text";
import type { ChatId, ReplyNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const MAX_INDENT = 6;
const indent = (depth: number) => 20 + Math.max(0, Math.min(depth, MAX_INDENT) - 1) * 22;

/** Recursive, collapsible reply tree with inline reply composers. */
export function ThreadNodes({ chatId, rootId, nodes, depth }: { chatId: ChatId; rootId: string; nodes: ReplyNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n) => (
        <ThreadNode key={n.id} chatId={chatId} rootId={rootId} node={n} depth={depth} />
      ))}
    </>
  );
}

function ThreadNode({ chatId, rootId, node, depth }: { chatId: ChatId; rootId: string; node: ReplyNode; depth: number }) {
  const open = useUiStore((s) => !!s.expanded[node.id]);
  const replying = useUiStore((s) => s.replyTo === node.id);
  const setExpanded = useUiStore((s) => s.setExpanded);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const p = PEOPLE[node.who];
  const nested = depth > 0;
  const k = countReplies(node.kids);

  return (
    <>
      <div className="hover:bg-muted" style={{ padding: `0 20px 0 ${indent(depth)}px` }}>
        <div className={cn("flex gap-2.5 border-l-2 py-[7px]", nested ? "border-border pl-3" : "border-transparent pl-0")}>
          <Avatar person={p} size={nested ? "md" : "xl"} className={nested ? "" : "rounded-[7px]"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn("font-bold", nested ? "text-sm" : "text-[15px]")}>{p.name}</span>
              {p.isAgent && <AgentBadge />}
              <span className="text-xs text-muted-foreground">{node.time}</span>
            </div>
            <RichText text={node.text} className={cn("mt-0.5 leading-[1.55]", nested ? "text-sm" : "text-[15px]")} />
            <div className="mt-0.5 flex items-center gap-3.5">
              {node.kids.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(node.id, !open)}
                  aria-expanded={open}
                  className="inline-flex min-h-[30px] cursor-pointer items-center gap-[5px] py-1 text-[13px] font-bold text-link hover:underline"
                >
                  <ChevronRightIcon className={cn("size-[13px] transition-transform", open && "rotate-90")} strokeWidth={2.4} />
                  {open ? "Hide replies" : k === 1 ? "1 reply" : `${k} replies`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setReplyTo(replying ? null : node.id)}
                className="inline-flex min-h-[30px] cursor-pointer items-center gap-[5px] py-1 text-[13px] font-semibold text-muted-foreground hover:underline"
              >
                <ReplyIcon className="size-[13px]" />
                {replying ? "Cancel" : "Reply"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {open && node.kids.length > 0 && <ThreadNodes chatId={chatId} rootId={rootId} nodes={node.kids} depth={depth + 1} />}
      {replying && <InlineReply chatId={chatId} rootId={rootId} node={node} depth={depth + 1} />}
    </>
  );
}

function InlineReply({ chatId, rootId, node, depth }: { chatId: ChatId; rootId: string; node: ReplyNode; depth: number }) {
  const [draft, setDraft] = useState("");
  const send = useSendMessage();
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const setExpanded = useUiStore((s) => s.setExpanded);
  const name = PEOPLE[node.who].first;
  const inputId = `reply-${node.id}`;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    send.mutate({ chatId, text, threadId: rootId, parentId: node.id });
    setDraft("");
    setReplyTo(null);
    setExpanded(node.id, true);
  };

  return (
    <div style={{ padding: `0 20px 0 ${indent(depth)}px` }}>
      <div className="border-l-2 border-border pt-1 pb-2.5 pl-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-input bg-white py-[3px] pr-[3px] pl-2.5 focus-within:border-[#8B95A5]">
          <label htmlFor={inputId} className="sr-only">
            Reply to {name}
          </label>
          <input
            id={inputId}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return setReplyTo(null);
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Reply to ${name}…`}
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent py-[7px] text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={submit}
            aria-label="Send reply"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-brand text-white hover:opacity-90"
          >
            <SendIcon className="size-[15px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
