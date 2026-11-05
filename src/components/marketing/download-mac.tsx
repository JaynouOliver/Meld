/**
 * "Download for Mac": the Mac app's DMG from GitHub Releases (apps/mac). Points at a
 * specific release because GitHub's /releases/latest skips pre-releases; bump it with
 * each Mac release.
 */
export const MAC_DMG_URL = "https://github.com/JaynouOliver/Meld/releases/download/mac-v0.1.0/Meld.dmg";
export const MAC_RELEASE_URL = "https://github.com/JaynouOliver/Meld/releases/tag/mac-v0.1.0";

export function DownloadMac() {
  return (
    <a
      href={MAC_DMG_URL}
      title="Meld for Mac (beta) · macOS 26 or later · Apple Silicon and Intel"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground"
    >
      <AppleIcon className="size-4" />
      Download for Mac
      <span className="rounded-[3px] border border-agent-border bg-agent px-1 text-[10px] leading-4 font-medium text-agent-foreground">Beta</span>
    </a>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.12 2.98-.79.88-2.07 1.56-3.1 1.48-.13-1.1.42-2.25 1.1-2.98.77-.84 2.1-1.47 3.12-1.48ZM20.6 17.2c-.55 1.27-.81 1.84-1.52 2.96-.99 1.56-2.38 3.5-4.11 3.52-1.53.01-1.93-1-4.01-.99-2.08.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C.12 16-.17 10.88 1.6 8.16c1.26-1.93 3.24-3.06 5.11-3.06 1.9 0 3.1 1.04 4.67 1.04 1.53 0 2.46-1.04 4.66-1.04 1.66 0 3.43.91 4.68 2.47-4.11 2.26-3.45 8.13.88 9.63Z" />
    </svg>
  );
}
