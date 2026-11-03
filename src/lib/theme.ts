import type { ThemePref } from "@/stores/ui-store";

export const THEME_OPTIONS: { value: ThemePref; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match your device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/**
 * Runs in <head> before first paint, so a dark-mode page never flashes white.
 * Mirrors the logic in Providers (which takes over after hydration) and the store's
 * v2 migration (an older saved "light" means "follow the system").
 */
export const THEME_BOOT_SCRIPT = `try{var j=JSON.parse(localStorage.getItem("meld-ui")||"{}"),t=(j.version>=2&&j.state&&j.state.theme)||"system";if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
