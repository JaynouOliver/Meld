"use client";

import { useEffect, useRef } from "react";

const THRESHOLD = 40;

/**
 * Keeps a chat scroller pinned to the newest message while the user is at the
 * bottom: across new messages, content that grows after render (ticket cards),
 * and viewport changes such as the on-screen keyboard opening.
 * Returns refs for the scroll container and its content wrapper.
 */
export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(resetKey: unknown) {
  const scrollRef = useRef<T>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    const toBottom = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
    };
    toBottom();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(toBottom);
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    window.visualViewport?.addEventListener("resize", toBottom);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", toBottom);
    };
  }, [resetKey]);

  /** Call after the user sends something: always jump to the newest message. */
  const pin = () => {
    pinned.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  return { scrollRef, contentRef, pin };
}
