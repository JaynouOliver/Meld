import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { setCtxProvider, type RequestCtx } from "@/lib/context";

/**
 * Per-request workspace context on the server. Everything that runs inside runInCtx()
 * (an API call, an Atlas run, the work it schedules with after()) sees that workspace's
 * directory and store via currentCtx().
 */
const als = new AsyncLocalStorage<RequestCtx>();
setCtxProvider(() => als.getStore());

export function runInCtx<T>(ctx: RequestCtx, fn: () => T): T {
  return als.run(ctx, fn);
}
