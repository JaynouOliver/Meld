import type { Directory } from "./directory";
import { demoDirectory } from "./mock/demo";
import type { Role } from "./types";
import type { Store } from "./store/types";

/**
 * The workspace a piece of code is working in: who's asking (directory) and where its
 * data lives (store, scoped to that workspace). On the server every API request and
 * Atlas run sets it (src/server/context.ts, AsyncLocalStorage), so nothing can read
 * another workspace's data by accident. The browser preview and the evals use the
 * Northwind demo.
 */
export interface RequestCtx {
  dir: Directory;
  store: Store;
}

let provider: (() => RequestCtx | undefined) | null = null;

/** The server registers how to find the current request's context. */
export function setCtxProvider(p: () => RequestCtx | undefined) {
  provider = p;
}

let demo: RequestCtx | null = null;
let demoStoreFactory: ((workspaceId: string) => Store) | null = null;
/** Memory store factory, registered by the memory store module (avoids an import cycle). */
export function setDemoStoreFactory(f: (workspaceId: string) => Store) {
  demoStoreFactory = f;
}

export function currentCtx(): RequestCtx {
  const c = provider?.();
  if (c) return c;
  // Outside a request: only the demo, and only when no real database is in play.
  const real = typeof window === "undefined" && process.env.DATA_STORE !== "memory" && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (real) throw new Error("No workspace context: server code must run inside runInCtx()");
  if (!demoStoreFactory) throw new Error("Memory store not loaded");
  demo ??= { dir: demoDirectory(), store: demoStoreFactory("northwind") };
  return demo;
}

export const currentDir = () => currentCtx().dir;

/** The demo context as a given role (evals). */
export function demoCtxAs(role: Role): RequestCtx {
  const base = currentCtx();
  return { ...base, dir: { ...base.dir, role } };
}
