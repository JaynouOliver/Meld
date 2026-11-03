/**
 * Splits message text into plain text, @mentions, ticket references (`${ticketPrefix}-123`,
 * e.g. NW-121) and Atlas's verified citations.
 */
export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string }
  | { kind: "ticket"; text: string; id: string }
  | { kind: "cite"; text: string; chatId: string; threadId: string | null; id: string };

// Written by the server after it verifies a citation (src/server/atlas/run.ts).
const CITE = /^\[\[cite:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)\]\]$/;
const CITE_SRC = "\\[\\[cite:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\\]\\]";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function splitText(text: string, ticketPrefix: string): TextPart[] {
  const ticket = `${escape(ticketPrefix)}-\\d+`;
  const ticketRe = new RegExp(`^${ticket}$`, "i");
  return String(text)
    .split(new RegExp(`(${CITE_SRC}|@\\w+|\\b${ticket}\\b)`, "i"))
    .filter((p) => p !== "")
    .map((p): TextPart => {
      const c = p.match(CITE);
      if (c) return { kind: "cite", text: p, chatId: c[1], threadId: c[2] === "-" ? null : c[2], id: c[3] };
      if (/^@\w+$/.test(p)) return { kind: "mention", text: p };
      if (ticketRe.test(p)) return { kind: "ticket", text: p, id: p.toUpperCase() };
      return { kind: "text", text: p };
    });
}

/** True when the message addresses Atlas: it's in the Atlas DM (`atlasDm`, see atlasDmOf) or tags @atlas. */
export function mentionsAgent(text: string, chatId: string, atlasDm: string | null) {
  return (!!atlasDm && chatId === atlasDm) || /@(atlas|agent)\b/i.test(text);
}

export function countReplies(list: unknown[] | undefined): number {
  return list?.length ?? 0;
}
