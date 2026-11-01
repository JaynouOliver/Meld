import { create } from "zustand";

/**
 * Hash router for the single-file preview. Maps app paths to plain #names
 * (the only hash form the artifact viewer passes through):
 *   /chat/design -> #chat-design, /tickets -> #tickets, /tickets/mine -> #tickets-mine
 */
export const toHash = (path: string) => path.replace(/^\//, "").replace(/\//g, "-");
const startPath = () =>
  typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches ? "/home" : "/chat/design";

export const fromHash = (hash: string) => {
  const h = hash.replace(/^#/, "");
  if (h === "tickets-mine") return "/tickets/mine";
  if (h.startsWith("chat-")) return "/chat/" + h.slice(5);
  if (["tickets", "home", "me"].includes(h)) return "/" + h;
  return startPath();
};

export const useRouter = create<{ path: string }>(() => ({
  path: fromHash(typeof window === "undefined" ? "" : window.location.hash),
}));

// In-preview history (the sandboxed frame can't rely on the browser's).
const stack: string[] = [];

export function back() {
  const prev = stack.pop();
  if (prev) setPath(prev);
}

export function navigate(path: string) {
  const cur = useRouter.getState().path;
  if (cur !== path) stack.push(cur);
  setPath(path);
}

function setPath(path: string) {
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
