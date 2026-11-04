"use client";

import { useState } from "react";

import { ATLAS_ID } from "@/lib/directory";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-5 text-[8px]",
  sm: "size-[22px] text-[9px]",
  md: "size-7 text-[10px]",
  lg: "size-8 text-[11px]",
  xl: "size-8 text-[11px]",
  "2xl": "size-16 text-[20px]",
} as const;

/** Agents with their own character (public/avatars, CC0 art, see CREDITS.md). */
const CHARACTERS = new Set(["atlas", "tess", "rex", "sunny"]);
const AGENT_POOL = 8;
const PERSON_POOL = 24;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The face for someone: their own photo if they have one, an agent's character, or a
 * stable illustrated face picked by id, so everyone looks like someone from day one.
 */
export function avatarSrc(p: Partial<Pick<Person, "id" | "name" | "isAgent" | "avatarUrl">>): string | null {
  if (p.avatarUrl) return p.avatarUrl;
  if (!p.id) return null;
  if (p.id === ATLAS_ID) return "/avatars/agent-atlas.svg";
  if (p.isAgent) {
    const key = (p.name ?? "").trim().toLowerCase();
    return CHARACTERS.has(key) ? `/avatars/agent-${key}.svg` : `/avatars/agent-${hash(p.id) % AGENT_POOL}.svg`;
  }
  return `/avatars/person-${hash(p.id) % PERSON_POOL}.svg`;
}

/**
 * Avatar: an illustrated face (rounded square for people, circle for agents) over the
 * person's identity color and initials, which show until the image loads or if it fails.
 */
export function Avatar({
  person,
  size = "xl",
  presence,
  ringClassName = "border-sidebar",
  className,
}: {
  person: Pick<Person, "initials" | "color"> & Partial<Pick<Person, "id" | "name" | "isAgent" | "avatarUrl">>;
  size?: keyof typeof SIZES;
  presence?: boolean;
  ringClassName?: string;
  className?: string;
}) {
  const src = avatarSrc(person);
  const [failed, setFailed] = useState(false);
  const shape = person.isAgent || person.id === ATLAS_ID ? "rounded-full" : size === "xs" ? "rounded-full" : size === "2xl" ? "rounded-xl" : "rounded-[6px]";
  return (
    <span
      aria-hidden
      style={{ background: person.color }}
      className={cn("relative inline-flex shrink-0 items-center justify-center font-semibold text-white select-none", SIZES[size], className, shape)}
    >
      {person.initials}
      {src && !failed && (
        // Plain img: small static SVGs from our own origin, cached forever by the CDN.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover", shape)}
        />
      )}
      {presence && <span className={cn("absolute -right-[3px] -bottom-[3px] size-[9px] rounded-full border-2 bg-online", ringClassName)} />}
    </span>
  );
}
