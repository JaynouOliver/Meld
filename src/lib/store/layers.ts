import type { Store } from "./types";

/**
 * Stores are wrapped in layers (assignment pick-up, automation, comment mentions), each
 * reacting to writes. A layer only reacts to writes made through the request's own
 * store, but the request holds the OUTERMOST layer, so an identity check against the
 * layer itself never matched for inner layers. Each layer records what it wraps, and
 * `servesCtx` walks the chain from the request's store.
 */
const INNER = Symbol.for("meld.store.inner");

/** Mark `wrapped` as a layer over `inner`. Returns `wrapped`. */
export function layer(inner: Store, wrapped: Store): Store {
  Object.defineProperty(wrapped, INNER, { value: inner, enumerable: false });
  return wrapped;
}

/** Is `store` the request's store, or one of the layers inside it? */
export function servesCtx(store: Store, ctxStore: Store): boolean {
  for (let s: Store | undefined = ctxStore; s; s = (s as unknown as Record<symbol, Store | undefined>)[INNER]) {
    if (s === store) return true;
  }
  return false;
}
