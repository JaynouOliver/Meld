/**
 * A chat's loaded history beyond the latest window (pure, shared by the chat screen and tests).
 *
 * The messages cache holds top-level messages oldest first. Normally that's the latest
 * window. Jumping to an older message, or scrolling back, merges more conversations in.
 * Every window the server returns is contiguous, so a merge either overlaps what's loaded
 * (splice it in) or doesn't (the jump target is older than the latest window: it goes
 * first, with a gap after it). At most one gap is kept: a second far jump replaces the
 * older segment instead of keeping a patchwork. Cached times are display labels, so order
 * comes from the windows themselves, never from comparing times.
 */
import type { Message } from "./types";

export interface History {
  messages: Message[];
  /** Last message before history that isn't loaded (between an older segment and the latest). */
  gapAfter: string | null;
}

/** Top-level id a message belongs to: itself, or the thread root of a reply. */
export function rootOf(list: Message[], id: string): Message | null {
  return list.find((m) => m.id === id || m.replies.some((r) => r.id === id)) ?? null;
}

/** Split at the gap: [older segment, latest segment] or just [everything]. */
function segments(h: History): Message[][] {
  const i = h.gapAfter ? h.messages.findIndex((m) => m.id === h.gapAfter) : -1;
  if (i < 0 || i === h.messages.length - 1) return [h.messages];
  return [h.messages.slice(0, i + 1), h.messages.slice(i + 1)];
}

const overlaps = (a: Message[], ids: Set<string>) => a.some((m) => ids.has(m.id));

/**
 * Union of a loaded segment and an overlapping window. The window is authoritative for its
 * own span (fresh edits, and anything missing from it was deleted); the segment keeps what
 * lies outside that span.
 */
export function splice(seg: Message[], win: Message[], tail: "keep" | "drop" = "keep"): Message[] {
  const ids = new Set(win.map((m) => m.id));
  const i0 = seg.findIndex((m) => ids.has(m.id));
  if (i0 < 0) return seg;
  let i1 = i0;
  for (let i = seg.length - 1; i > i0; i--) {
    if (ids.has(seg[i].id)) {
      i1 = i;
      break;
    }
  }
  return [...seg.slice(0, i0), ...win, ...(tail === "keep" ? seg.slice(i1 + 1) : [])];
}

/**
 * Merge a window fetched around a message (a jump, "Load older" or "Load newer").
 * A window that touches nothing loaded is older than the latest window: it becomes the
 * older segment (replacing any previous one), with a gap before the latest messages.
 */
export function mergeWindow(h: History, win: Message[]): History {
  if (!win.length) return h;
  if (!h.messages.length) return { messages: win, gapAfter: null };
  const ids = new Set(win.map((m) => m.id));
  const segs = segments(h);
  const latest = segs[segs.length - 1];
  const older = segs.length > 1 ? segs[0] : null;
  const hitsLatest = overlaps(latest, ids);
  const hitsOlder = !!older && overlaps(older, ids);

  if (!hitsLatest && !hitsOlder) return { messages: [...win, ...latest], gapAfter: win[win.length - 1].id };
  // The window bridges the gap: one contiguous history again.
  if (hitsLatest && hitsOlder) return { messages: [...splice(older!, win, "drop"), ...after(win, latest)], gapAfter: null };
  if (hitsLatest) {
    const merged = splice(latest, win);
    return older ? { messages: [...older, ...merged], gapAfter: h.gapAfter } : { messages: merged, gapAfter: null };
  }
  const merged = splice(older!, win);
  return { messages: [...merged, ...latest], gapAfter: merged[merged.length - 1].id };
}

/** What of `seg` comes after the window's last overlap with it. */
function after(win: Message[], seg: Message[]): Message[] {
  const ids = new Set(win.map((m) => m.id));
  let last = -1;
  seg.forEach((m, i) => {
    if (ids.has(m.id)) last = i;
  });
  return seg.slice(last + 1);
}

/**
 * Merge a refetch of the latest window (realtime, focus). It's authoritative from its
 * first message to the end; older history the person loaded is kept before it.
 * Without loaded history this is a plain replace, the behaviour before history existed.
 */
export function mergeLatest(h: History, latest: Message[], extended: boolean): History {
  if (!extended || !h.messages.length || !latest.length) return { messages: latest, gapAfter: null };
  const ids = new Set(latest.map((m) => m.id));
  const segs = segments(h);
  if (segs.length > 1 && overlaps(segs[0], ids)) return { messages: splice(segs[0], latest, "drop"), gapAfter: null };
  const last = segs[segs.length - 1];
  // More than a window of new messages since the last fetch: start over from the latest.
  if (!overlaps(last, ids)) return { messages: latest, gapAfter: null };
  const merged = splice(last, latest, "drop");
  return segs.length > 1 ? { messages: [...segs[0], ...merged], gapAfter: h.gapAfter } : { messages: merged, gapAfter: null };
}

export type FocusTarget = { chatId: string; threadId: string | null; id: string };

/**
 * Where a jump lands in the loaded messages: the top-level message to scroll to, and the
 * thread to open when the target is a reply. "missing" means fetch the window around it.
 * The thread id from the link is only a hint (a root can be deleted, a link can be stale);
 * the loaded tree decides.
 */
export function resolveFocus(list: Message[], f: FocusTarget): { status: "ready"; rootId: string; threadId: string | null } | { status: "missing" } {
  const root = rootOf(list, f.id);
  if (!root) return { status: "missing" };
  return { status: "ready", rootId: root.id, threadId: root.id === f.id ? null : root.id };
}

/** True if the window reached the chat's first conversation (fewer older ones than asked for). */
export function reachedStart(win: Message[], anchorId: string, before: number): boolean {
  const i = win.findIndex((m) => m.id === anchorId || m.replies.some((r) => r.id === anchorId));
  return i >= 0 && i < before;
}
