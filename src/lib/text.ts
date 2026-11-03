/** Splits message text into plain text, @mentions, NW- ticket references and Atlas's verified citations. */
export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string }
  | { kind: "ticket"; text: string; id: string }
  | { kind: "cite"; text: string; chatId: string; threadId: string | null; id: string };

// Written by the server after it verifies a citation (src/server/atlas/run.ts).
const CITE = /^\[\[cite:([a-z]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)\]\]$/;

export function splitText(text: string): TextPart[] {
  return String(text)
    .split(/(\[\[cite:[a-z]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\]\]|@\w+|\bNW-\d+\b)/i)
    .filter((p) => p !== "")
    .map((p): TextPart => {
      const c = p.match(CITE);
      if (c) return { kind: "cite", text: p, chatId: c[1], threadId: c[2] === "-" ? null : c[2], id: c[3] };
      if (/^@\w+$/.test(p)) return { kind: "mention", text: p };
      if (/^NW-\d+$/i.test(p)) return { kind: "ticket", text: p, id: p.toUpperCase() };
      return { kind: "text", text: p };
    });
}

export function mentionsAgent(text: string, chatId: string) {
  return chatId === "atlas" || /@(atlas|agent)\b/i.test(text);
}

export function countReplies(list: unknown[] | undefined): number {
  return list?.length ?? 0;
}
