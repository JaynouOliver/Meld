/** Splits message text into plain text, @mentions and NW- ticket references. */
export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string }
  | { kind: "ticket"; text: string; id: string };

export function splitText(text: string): TextPart[] {
  return String(text)
    .split(/(@\w+|\bNW-\d+\b)/i)
    .filter((p) => p !== "")
    .map((p): TextPart => {
      if (/^@\w+$/.test(p)) return { kind: "mention", text: p };
      if (/^NW-\d+$/i.test(p)) return { kind: "ticket", text: p, id: p.toUpperCase() };
      return { kind: "text", text: p };
    });
}

export function mentionsAgent(text: string, chatId: string) {
  return chatId === "atlas" || /@(atlas|agent)\b/i.test(text);
}

export function countReplies(list: { kids?: unknown[] }[] | undefined): number {
  return (list || []).reduce((a, n) => a + 1 + countReplies(n.kids as { kids?: unknown[] }[]), 0);
}
