/** Where the browser keeps the workspace's data between visits (see Providers). */
export const CACHE_KEY = "meld-cache-v1";

/** Forget it: signing out, or switching to / joining another workspace. */
export function clearLocalCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage may be unavailable (private mode); nothing to clear then.
  }
}
