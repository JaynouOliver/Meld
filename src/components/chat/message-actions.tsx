"use client";

import { MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, SmilePlusIcon, Trash2Icon } from "lucide-react";
import { Popover } from "radix-ui";
import { useLayoutEffect, useRef, useState } from "react";

import { RichText } from "@/components/common/rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDirectory, useRole } from "@/hooks/use-directory";
import { useDeleteMessage, useEditMessage, usePinMessage, useToggleReaction } from "@/hooks/use-messages";
import { ATLAS_ID, personOf } from "@/lib/directory";
import { canDeleteMessage, canEditMessage, canPinMessage, PICKER_EMOJI } from "@/lib/message-ops";
import type { ChatId, Message, ReplyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Node = Message | ReplyNode;

/** What the signed-in person may do with a message (the server checks again). */
export function useMessagePermissions(node: Node) {
  const dir = useDirectory();
  const role = useRole();
  const pending = node.id.startsWith("pending-");
  const facts = { who: node.who, byAgent: node.who === ATLAS_ID || !!personOf(dir, node.who).isAgent, deletedAt: node.deletedAt };
  const actor = { me: dir.me, role };
  const live = !pending && !node.deletedAt;
  return {
    canEdit: live && canEditMessage(actor, facts),
    canDelete: live && canDeleteMessage(actor, facts),
    canPin: live && canPinMessage(role),
    canReact: live,
  };
}

const TOOL = "flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground";

/**
 * The hover toolbar on a message (pointer devices): react, any extra buttons (reply in
 * thread), pin, edit, delete. Stays visible while its picker or dialog is open.
 */
export function MessageToolbar({
  chatId,
  node,
  onEdit,
  children,
  className,
}: {
  chatId: ChatId;
  node: Node;
  onEdit: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const can = useMessagePermissions(node);
  const pin = usePinMessage();
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (node.id.startsWith("pending-")) return null;
  const pinned = !!node.pinnedAt;
  return (
    <>
      <div
        className={cn(
          "absolute -top-3.5 right-5 z-[1] flex rounded-md border bg-card p-0.5 opacity-0 shadow-sm transition-opacity pointer-coarse:hidden group-focus-within:opacity-100 group-hover:opacity-100",
          (picker || confirm) && "opacity-100",
          className,
        )}
      >
        {can.canReact && (
          <EmojiPicker chatId={chatId} node={node} open={picker} onOpenChange={setPicker}>
            <button type="button" aria-label="Add reaction" title="Add reaction" className={TOOL}>
              <SmilePlusIcon className="size-4" />
            </button>
          </EmojiPicker>
        )}
        {children}
        {can.canPin && (
          <button
            type="button"
            aria-label={pinned ? "Unpin message" : "Pin message"}
            title={pinned ? "Unpin" : "Pin to channel"}
            onClick={() => pin.mutate({ chatId, id: node.id, on: !pinned })}
            className={TOOL}
          >
            {pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          </button>
        )}
        {can.canEdit && (
          <button type="button" aria-label="Edit message" title="Edit" onClick={onEdit} className={TOOL}>
            <PencilIcon className="size-4" />
          </button>
        )}
        {can.canDelete && (
          <button type="button" aria-label="Delete message" title="Delete" onClick={() => setConfirm(true)} className={cn(TOOL, "hover:text-destructive")}>
            <Trash2Icon className="size-4" />
          </button>
        )}
      </div>
      <DeleteDialog chatId={chatId} node={node} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

/**
 * Touch screens have no hover: a "more" button (shown in the thread panel) with the
 * same actions in a menu, plus a row of quick reactions.
 */
export function TouchActions({ chatId, node, onEdit }: { chatId: ChatId; node: Node; onEdit: () => void }) {
  const can = useMessagePermissions(node);
  const pin = usePinMessage();
  const react = useToggleReaction();
  const me = useDirectory().me;
  const [confirm, setConfirm] = useState(false);
  if (!can.canReact && !can.canDelete) return null;
  const pinned = !!node.pinnedAt;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Message actions" className="hidden size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground pointer-coarse:flex">
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          {can.canReact && (
            <>
              <div className="grid grid-cols-6 gap-0.5 p-1">
                {PICKER_EMOJI.slice(0, 6).map(([e, name]) => {
                  const mine = !!node.reactions?.[e]?.includes(me);
                  return (
                    <DropdownMenuItem
                      key={e}
                      aria-label={`React with ${name}`}
                      onSelect={() => react.mutate({ chatId, id: node.id, emoji: e, on: !mine })}
                      className={cn("flex size-9 justify-center p-0 text-[18px]", mine && "bg-selected")}
                    >
                      {e}
                    </DropdownMenuItem>
                  );
                })}
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          {can.canPin && (
            <DropdownMenuItem onSelect={() => pin.mutate({ chatId, id: node.id, on: !pinned })}>
              {pinned ? <PinOffIcon /> : <PinIcon />}
              {pinned ? "Unpin" : "Pin to channel"}
            </DropdownMenuItem>
          )}
          {can.canEdit && (
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon />
              Edit message
            </DropdownMenuItem>
          )}
          {can.canDelete && (
            <DropdownMenuItem onSelect={() => setConfirm(true)} className="text-destructive focus:text-destructive">
              <Trash2Icon />
              Delete message
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialog chatId={chatId} node={node} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

/** The reaction picker: a small grid of common emoji. Picking one toggles yours. */
function EmojiPicker({
  chatId,
  node,
  open,
  onOpenChange,
  children,
}: {
  chatId: ChatId;
  node: Node;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const react = useToggleReaction();
  const me = useDirectory().me;
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Add reaction"
          onClick={(e) => e.stopPropagation()}
          className="z-50 rounded-md border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <div className="grid grid-cols-6 gap-0.5">
            {PICKER_EMOJI.map(([e, name]) => {
              const mine = !!node.reactions?.[e]?.includes(me);
              return (
                <button
                  key={e}
                  type="button"
                  aria-label={`React with ${name}`}
                  aria-pressed={mine}
                  title={name}
                  onClick={() => {
                    react.mutate({ chatId, id: node.id, emoji: e, on: !mine });
                    onOpenChange(false);
                  }}
                  className={cn("flex size-8 cursor-pointer items-center justify-center rounded-sm text-[18px] leading-none hover:bg-accent", mine && "bg-selected")}
                >
                  {e}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DeleteDialog({ chatId, node, open, onOpenChange }: { chatId: ChatId; node: Node; open: boolean; onOpenChange: (v: boolean) => void }) {
  const del = useDeleteMessage();
  const dir = useDirectory();
  const replies = "replies" in node ? node.replies.length : 0;
  const mine = node.who === dir.me;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Delete message?"
        description={mine ? "This can't be undone." : `This removes ${personOf(dir, node.who).name}'s message for everyone. It can't be undone.`}
        className="max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-28 overflow-hidden rounded-md border bg-muted px-3 py-2 text-[13px] text-ink-2">
          <p className="line-clamp-4 whitespace-pre-wrap [overflow-wrap:anywhere]">{node.text}</p>
        </div>
        {replies > 0 && (
          <p className="mt-2.5 text-[13px] text-muted-foreground">
            The thread stays: its {replies === 1 ? "reply" : `${replies} replies`} remain under a &ldquo;This message was deleted&rdquo; placeholder.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            autoFocus
            onClick={() => {
              del.mutate({ chatId, id: node.id });
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A message's text: the inline editor while editing, a placeholder once deleted,
 * otherwise the formatted text with "(edited)" at the end.
 */
export function MessageBody({
  chatId,
  node,
  editing,
  onDone,
}: {
  chatId: ChatId;
  node: Node;
  editing: boolean;
  onDone: () => void;
}) {
  if (node.deletedAt) return <p className="text-body text-muted-foreground italic">This message was deleted.</p>;
  if (editing) return <MessageEditor chatId={chatId} node={node} onDone={onDone} />;
  return (
    <RichText
      text={node.text}
      className="text-body"
      after={node.editedAt ? <span className="ml-1 text-[12px] text-muted-foreground" title={`Edited ${new Date(node.editedAt).toLocaleString()}`}>(edited)</span> : null}
    />
  );
}

/** Inline editor: Enter saves, Shift+Enter adds a line, Esc cancels. */
function MessageEditor({ chatId, node, onDone }: { chatId: ChatId; node: Node; onDone: () => void }) {
  const [draft, setDraft] = useState(node.text);
  const edit = useEditMessage();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);
  useLayoutEffect(() => {
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    if (text !== node.text) edit.mutate({ chatId, id: node.id, text });
    onDone();
  };

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <label htmlFor={`edit-${node.id}`} className="sr-only">
        Edit message
      </label>
      <textarea
        id={`edit-${node.id}`}
        ref={ref}
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            // Handled here: don't also close the thread panel.
            e.preventDefault();
            e.stopPropagation();
            onDone();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
        className="block w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-base outline-none focus:border-ring focus:ring-1 focus:ring-ring md:text-body"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="mr-auto text-[12px] text-muted-foreground max-sm:hidden">Enter to save · Esc to cancel</span>
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!draft.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** "Pinned by Ada" above a pinned message's header. */
export function PinnedLabel({ node }: { node: Node }) {
  const dir = useDirectory();
  if (!node.pinnedAt) return null;
  const by = node.pinnedBy ? (node.pinnedBy === dir.me ? "you" : personOf(dir, node.pinnedBy).name) : null;
  return (
    <div className="mb-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
      <PinIcon aria-hidden className="size-3" />
      Pinned{by ? ` by ${by}` : ""}
    </div>
  );
}
