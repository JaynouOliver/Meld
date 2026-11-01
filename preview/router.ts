import { create } from "zustand";

/**
 * Hash router for the single-file preview. Maps app paths to plain #names
 * (the only hash form the artifact viewer passes through):
 *   /chat/design -> #chat-design, /tickets -> #tickets, /tickets/mine -> #tickets-mine
 */
export const toHash = (path: string) => path.replace(/^\//, "").replace(/\//g, "-");
export const fromHash = (hash: string) => {
  const h = hash.replace(/^#/, "");
  if (h === "tickets") return "/tickets";
  if (h === "tickets-mine") return "/tickets/mine";
  if (h.startsWith("chat-")) return "/chat/" + h.slice(5);
  return "/chat/design";
};

export const useRouter = create<{ path: string }>(() => ({
  path: typeof window === "undefined" ? "/chat/design" : fromHash(window.location.hash),
}));

export function navigate(path: string) {
  useRouter.setState({ path });
  try {
    history.replaceState(null, "", "#" + toHash(path));
  } catch {
    /* sandboxed frames may refuse; in-memory routing still works */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => useRouter.setState({ path: fromHash(window.location.hash) }));
}
