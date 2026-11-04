"use client";

import { useState } from "react";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { ActionCard } from "@/components/chat/action-card";
import { MessageBody, MessageToolbar, PinnedLabel, TouchActions } from "@/components/chat/message-actions";
import { MessageReactions } from "@/components/chat/reactions";
import { useDirectory } from "@/hooks/use-directory";
import { useFlash } from "@/hooks/use-flash";
import { personOf } from "@/lib/directory";
import type { ChatId, ReplyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A thread's replies, in order. Threads are flat, like Slack: you reply to the
 * thread (composer at the bottom of the panel), never to a single reply.
 */
export function ThreadNodes({ chatId, nodes }: { chatId: ChatId; nodes: ReplyNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <ThreadReply key={n.id} chatId={chatId} node={n} />
      ))}
    </>
  );
}

function ThreadReply({ chatId, node }: { chatId: ChatId; node: ReplyNode }) {
  const p = personOf(useDirectory(), node.who);
  const { ref, flashing } = useFlash<HTMLDivElement>(node.id);
  const [editing, setEditing] = useState(false);
  return (
    <div ref={ref} className={cn("group relative px-4 transition-colors duration-700 hover:bg-muted sm:px-5", flashing && "bg-mention")}>
      <div className="flex gap-2.5 py-1.5">
        <Avatar person={p} size="xl" />
        <div className="min-w-0 flex-1">
          <PinnedLabel node={node} />
          <div className="flex items-baseline gap-2">
            <span className="text-body font-semibold">{p.name}</span>
            {p.isAgent && <AgentBadge />}
            <span className="text-xs text-muted-foreground">{node.time}</span>
          </div>
          <MessageBody chatId={chatId} node={node} editing={editing} onDone={() => setEditing(false)} />
          {node.action && <ActionCard action={node.action} />}
          <MessageReactions chatId={chatId} node={node} />
        </div>
        {!editing && <TouchActions chatId={chatId} node={node} onEdit={() => setEditing(true)} />}
      </div>
      {!editing && <MessageToolbar chatId={chatId} node={node} onEdit={() => setEditing(true)} className="right-4 sm:right-5" />}
    </div>
  );
}
