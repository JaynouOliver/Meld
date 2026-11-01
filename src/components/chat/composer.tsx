"use client";

import { AtSignIcon, SendIcon, TicketIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useSendMessage } from "@/hooks/use-messages";
import { useVisibleTickets } from "@/hooks/use-tickets";
import { CHAT_META, MENTIONABLE, PEOPLE, STATUS_COLORS, teamName } from "@/lib/constants";
import type { ChatId } from "@/lib/types";
import { cn } from "@/lib/utils";

type Pop = { kind: "people" | "tickets"; q: string } | null;

interface Option {
  insert: string;
  name: string;
  handle: string;
  sub: string;
  badge: string;
  color: string;
  ink: string;
}

function detectPop(val: string): Pop {
  const m1 = val.match(/(^|\s)@(\w*)$/);
  if (m1) return { kind: "people", q: m1[2] };
  const m2 = val.match(/(^|\s)#([\w-]*)$/) || val.match(/(^|\s)(NW-?\d*)$/i);
  if (m2) return { kind: "tickets", q: m2[2] };
  return null;
}

/** Main chat composer: @ mentions people/Atlas, # or NW- mentions tickets the role can see. */
export function Composer({ chatId }: { chatId: ChatId }) {
  const meta = CHAT_META[chatId];
  const [draft, setDraft] = useState("");
  const [pop, setPop] = useState<Pop>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const send = useSendMessage();
  const { visible } = useVisibleTickets();

  const options: Option[] = useMemo(() => {
    if (!pop) return [];
    const q = pop.q.toLowerCase();
    if (pop.kind === "people") {
      return MENTIONABLE.filter((k) => PEOPLE[k].first.toLowerCase().startsWith(q)).map((k) => {
        const p = PEOPLE[k];
        return {
          insert: "@" + p.first, name: p.name, handle: "@" + p.first, badge: p.initials, color: p.color, ink: "#FFFFFF",
          sub: p.isAgent ? "Agent · create, read, update, delete tickets" : teamName(p.team),
        };
      });
    }
    const key = q.replace(/^nw-?/, "");
    return visible
      .filter((t) => !q || t.id.toLowerCase().includes(q) || t.id.slice(3).startsWith(key) || t.title.toLowerCase().includes(q))
      .slice(0, 6)
      .map((t) => {
        const [bg, fg] = STATUS_COLORS[t.status];
        return { insert: t.id, name: t.id, handle: t.title || "Untitled ticket", badge: t.id.slice(3), color: bg, ink: fg, sub: `${t.status} · ${teamName(t.team)}` };
      });
  }, [pop, visible]);

  const update = (val: string) => {
    setDraft(val);
    setPop(detectPop(val));
    setSel(0);
  };

  const pick = (insert: string) => {
    setDraft((d) => d.replace(/(@\w*|#[\w-]*|NW-?\d*)$/i, insert + " "));
    setPop(null);
    inputRef.current?.focus();
  };

  const startToken = (ch: string, kind: "people" | "tickets") => {
    setDraft((d) => d + (d === "" || /\s$/.test(d) ? ch : " " + ch));
    setPop({ kind, q: "" });
    setSel(0);
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    send.mutate({ chatId, text });
    setDraft("");
    setPop(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (options.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(options[Math.min(sel, options.length - 1)].insert);
        return;
      }
    }
    if (pop && e.key === "Escape") {
      setPop(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const placeholder = meta.kind === "channel" ? `Message #${meta.label}` : `Message ${PEOPLE[meta.who].name}`;
  const hint =
    chatId === "atlas"
      ? "Just ask: no @ needed in this DM. Atlas only sees what your role can see."
      : "Type @ to tag Atlas or a teammate, # or NW- to mention a ticket · Enter to send";
  const isPeople = pop?.kind === "people";

  return (
    <div className="relative px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] sm:px-5 md:pt-0 md:pb-5">
      {options.length > 0 && (
        <div
          role="listbox"
          id="composer-pop"
          aria-label={isPeople ? "Mention" : "Tickets you can see"}
          className="absolute bottom-[calc(100%-4px)] left-3 z-10 max-h-[min(300px,calc(100dvh-150px))] w-[380px] max-w-[calc(100%-24px)] md:bottom-[calc(100%-12px)] overflow-y-auto rounded-[10px] border bg-white p-1.5 shadow-[0_8px_24px_rgba(20,24,33,0.14)] sm:left-5"
        >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground [@media(max-height:500px)]:hidden">{isPeople ? "Mention" : "Tickets you can see"}</div>
          {options.map((o, i) => (
            <button
              key={o.insert}
              type="button"
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.insert);
              }}
              onMouseEnter={() => setSel(i)}
              className={cn("flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left", i === sel && "bg-selected")}
            >
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold" style={{ background: o.color, color: o.ink }}>
                {o.badge}
              </span>
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="truncate text-sm font-semibold text-foreground">
                  {o.name} <span className="font-normal text-muted-foreground">{o.handle}</span>
                </span>
                <span className="text-xs text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          ))}
          <div className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground [@media(max-height:500px)]:hidden">
            {isPeople ? "Enter or Tab to insert" : "Only tickets your role can access are suggested"}
          </div>
        </div>
      )}
      <div className="flex items-center gap-0.5 rounded-[10px] border border-input p-1 focus-within:border-[#8B95A5] focus-within:ring-2 focus-within:ring-ring/25 sm:gap-1 sm:p-1.5">
        <ComposerIconButton label="Mention a person or the agent" onClick={() => startToken("@", "people")}>
          <AtSignIcon className="size-[18px]" />
        </ComposerIconButton>
        <ComposerIconButton label="Mention a ticket" onClick={() => startToken("#", "tickets")}>
          <TicketIcon className="size-[18px]" />
        </ComposerIconButton>
        <label htmlFor="main-input" className="sr-only">
          {placeholder}
        </label>
        <input
          id="main-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setPop(null), 150)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls="composer-pop"
          className="min-w-0 flex-1 border-none bg-transparent px-1 py-[9px] text-base text-foreground md:text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submit}
          onMouseDown={keepFocus}
          aria-label="Send message"
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90"
        >
          <SendIcon className="size-[18px]" />
        </button>
      </div>
      <div className="hidden px-0.5 pt-1.5 text-xs text-muted-foreground md:block">{hint}</div>
    </div>
  );
}

/** Tapping a composer button must not blur the input (that closes the keyboard and the popover). */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function ComposerIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={keepFocus}
      className="flex size-10 shrink-0 md:size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
    >
      {children}
    </button>
  );
}
