"use client";

import { AgentBadge } from "@/components/common/agent-badge";
import { Avatar } from "@/components/common/avatar";
import { ActionCard } from "@/components/chat/action-card";
import { Reactions } from "@/components/chat/reactions";
import { RichText } from "@/components/common/rich-text";
import { useDirectory } from "@/hooks/use-directory";
import { useFlash } from "@/hooks/use-flash";
import { personOf } from "@/lib/directory";
import type { ReplyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A thread's replies, in order. Threads are flat, like Slack: you reply to the
 * thread (composer at the bottom of the panel), never to a single reply.
 */
export function ThreadNodes({ nodes }: { nodes: ReplyNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <ThreadReply key={n.id} node={n} />
      ))}
    </>
  );
}

function ThreadReply({ node }: { node: ReplyNode }) {
  const p = personOf(useDirectory(), node.who);
  const { ref, flashing } = useFlash<HTMLDivElement>(node.id);
  return (
    <div ref={ref} className={cn("px-4 transition-colors duration-700 hover:bg-muted sm:px-5", flashing && "bg-mention")}>
      <div className="flex gap-2.5 py-1.5">
        <Avatar person={p} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-body font-semibold">{p.name}</span>
            {p.isAgent && <AgentBadge />}
            <span className="text-xs text-muted-foreground">{node.time}</span>
          </div>
          <RichText text={node.text} className="text-body" />
          {node.action && <ActionCard action={node.action} />}
          <Reactions reactions={node.reactions} />
        </div>
      </div>
    </div>
  );
}
