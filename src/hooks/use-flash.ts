"use client";

import { useEffect, useRef } from "react";

import { useUiStore } from "@/stores/ui-store";

/**
 * For a message row: when it's the jump target (a citation was tapped), scroll it
 * into view and report true for a moment so the row can highlight itself.
 */
export function useFlash<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);
  const flashing = useUiStore((s) => s.flashId === id);
  useEffect(() => {
    if (!flashing) return;
    // Wait a frame so a just-opened thread panel has laid out.
    const raf = requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    const t = setTimeout(() => useUiStore.setState((s) => (s.flashId === id ? { flashId: null } : s)), 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [flashing, id]);
  return { ref, flashing };
}
