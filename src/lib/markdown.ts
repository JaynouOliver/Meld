/**
 * Slack-style message formatting on top of splitText (src/lib/text.ts), which still
 * finds @mentions, ticket ids and citations:
 *
 * - blocks: ``` fenced code ```, "- " bullet lists (indent two spaces to nest), and
 *   everything else as a paragraph (newlines kept, as before);
 * - inline: **bold**, _italic_, `code`, and bare http(s) URLs as links.
 *
 * Code spans, URLs and citations are taken out first, so their contents are never
 * formatted (`**not bold**`, https://x.com/a_b_c, [[cite:c_1:-:m_2]]). Pure: no React,
 * no HTML strings; the renderer turns parts into elements.
 */
import { splitText, type TextPart } from "./text";

export interface Marks {
  bold?: boolean;
  italic?: boolean;
}

export type InlinePart =
  | (TextPart & Marks)
  | ({ kind: "code"; text: string } & Marks)
  | ({ kind: "link"; text: string; href: string } & Marks);

export interface ListItem {
  parts: InlinePart[];
  children: ListItem[];
}

export type Block =
  | { kind: "para"; parts: InlinePart[] }
  | { kind: "code"; text: string }
  | { kind: "list"; items: ListItem[] };

const FENCE = /^\s*```/;
const BULLET = /^( *)[-*•] +(.*)$/;

/** Message text as blocks. A message with no code or list is one paragraph, as before. */
export function parseMessage(text: string, ticketPrefix: string): Block[] {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    // Blank lines around a list or code block are spacing, not content.
    while (para.length && !para[0].trim()) para.shift();
    while (para.length && !para[para.length - 1].trim()) para.pop();
    if (para.length) blocks.push({ kind: "para", parts: parseInline(para.join("\n"), ticketPrefix) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ```code``` on one line is inline code (the composer is a single line); a line that
    // opens a fence without closing it starts a block that runs to the closing ```.
    if (FENCE.test(line) && line.split("```").length === 2) {
      flush();
      const first = line.replace(/^\s*```[\w+-]*\s*/, "");
      const body: string[] = first ? [first] : [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = lines[j].indexOf("```");
        if (close >= 0) {
          const before = lines[j].slice(0, close);
          if (before) body.push(before);
          break;
        }
        body.push(lines[j]);
      }
      blocks.push({ kind: "code", text: body.join("\n") });
      // Text after the closing fence on the same line carries on as a paragraph.
      const rest = j < lines.length ? lines[j].slice(lines[j].indexOf("```") + 3) : "";
      if (rest.trim()) para.push(rest.trimStart());
      i = j;
      continue;
    }
    const b = line.match(BULLET);
    if (b) {
      flush();
      const items: { depth: number; text: string }[] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const m = lines[j].match(BULLET);
        if (!m) break;
        items.push({ depth: Math.floor(m[1].length / 2), text: m[2] });
      }
      blocks.push({ kind: "list", items: nest(items, ticketPrefix) });
      i = j - 1;
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks.length ? blocks : [{ kind: "para", parts: [] }];
}

/** Flat (depth, text) lines into a tree. A jump of several levels nests one level. */
function nest(lines: { depth: number; text: string }[], ticketPrefix: string): ListItem[] {
  const root: ListItem[] = [];
  const stack: { depth: number; items: ListItem[] }[] = [{ depth: -1, items: root }];
  for (const l of lines) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= l.depth) stack.pop();
    const item: ListItem = { parts: parseInline(l.text, ticketPrefix), children: [] };
    const top = stack[stack.length - 1];
    top.items.push(item);
    stack.push({ depth: l.depth, items: item.children });
  }
  return root;
}

// ---------------------------------------------------------------- inline

const CITE_SRC = "\\[\\[cite:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\\]\\]";
// Code first (``` or `), then citations, then URLs.
const PROTECT = new RegExp(`\`\`\`([^\\n]+?)\`\`\`|\`([^\`\\n]+)\`|(${CITE_SRC})|(https?://[^\\s<>"'\`]+)`, "g");
const OPEN = "";
const CLOSE = "";
const SLOT = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");

type Protected = { kind: "code"; text: string } | { kind: "link"; text: string; href: string } | { kind: "raw"; text: string };

/** One line or paragraph into formatted parts. */
export function parseInline(text: string, ticketPrefix: string): InlinePart[] {
  const saved: Protected[] = [];
  const slot = (p: Protected) => `${OPEN}${saved.push(p) - 1}${CLOSE}`;
  // Stray placeholder characters in the input would confuse the slots; drop them.
  const clean = String(text ?? "").replace(/[]/g, "");
  const work = clean.replace(PROTECT, (all, fence: string, code: string, cite: string, url: string) => {
    if (fence !== undefined) return slot({ kind: "code", text: fence });
    if (code !== undefined) return slot({ kind: "code", text: code });
    if (cite !== undefined) return slot({ kind: "raw", text: cite });
    const { href, trail } = trimUrl(url);
    return slot({ kind: "link", text: href, href }) + trail;
  });

  const out: InlinePart[] = [];
  for (const seg of marked(work, {})) {
    let last = 0;
    for (const m of seg.text.matchAll(SLOT)) {
      pushText(out, seg.text.slice(last, m.index), seg.marks, ticketPrefix);
      const p = saved[Number(m[1])];
      if (p.kind === "raw") pushText(out, p.text, seg.marks, ticketPrefix);
      else out.push({ ...p, ...seg.marks });
      last = m.index + m[0].length;
    }
    pushText(out, seg.text.slice(last), seg.marks, ticketPrefix);
  }
  return out;
}

/** Plain text (with mentions, tickets, citations) under the given marks. */
function pushText(out: InlinePart[], text: string, marks: Marks, ticketPrefix: string) {
  if (!text) return;
  for (const p of splitText(text, ticketPrefix)) out.push(hasMarks(marks) ? { ...p, ...marks } : p);
}
const hasMarks = (m: Marks) => !!(m.bold || m.italic);

// **bold**: no spaces just inside the stars. _italic_: not inside a word (snake_case stays).
const BOLD = /\*\*(?=\S)([^\n]*?\S)\*\*/;
const ITALIC = /(^|[^\p{L}\p{N}_])_(?=\S)([^\n_]*?\S)_(?![\p{L}\p{N}_])/u;

/** Split text into runs with bold/italic marks; markers nest (**_both_**). */
function marked(text: string, marks: Marks): { text: string; marks: Marks }[] {
  const b = text.match(BOLD);
  const it = text.match(ITALIC);
  const bAt = b?.index ?? Infinity;
  const iAt = it ? it.index! + it[1].length : Infinity;
  if (bAt === Infinity && iAt === Infinity) return text ? [{ text, marks }] : [];
  if (bAt <= iAt && b) {
    return [
      ...plain(text.slice(0, bAt), marks),
      ...marked(b[1], { ...marks, bold: true }),
      ...marked(text.slice(bAt + b[0].length), marks),
    ];
  }
  const m = it!;
  const end = m.index! + m[0].length;
  return [...plain(text.slice(0, iAt), marks), ...marked(m[2], { ...marks, italic: true }), ...marked(text.slice(end), marks)];
}
const plain = (text: string, marks: Marks) => (text ? [{ text, marks }] : []);

/** Leave sentence punctuation and an unmatched ")" outside the link. */
function trimUrl(url: string): { href: string; trail: string } {
  let href = url;
  let trail = "";
  for (;;) {
    const last = href.slice(-1);
    if (/[.,;:!?'"*_]/.test(last) || (last === ")" && (href.match(/\(/g)?.length ?? 0) < (href.match(/\)/g)?.length ?? 0))) {
      trail = last + trail;
      href = href.slice(0, -1);
    } else break;
  }
  return { href, trail };
}

/** True for plain messages (no list or code block): the renderer keeps its single <p>. */
export function isSinglePara(blocks: Block[]): blocks is [{ kind: "para"; parts: InlinePart[] }] {
  return blocks.length === 1 && blocks[0].kind === "para";
}

/** One-line preview of a message (search results, pins): markers and citations dropped. */
export function plainSnippet(text: string, max = 160): string {
  const s = String(text ?? "")
    .replace(new RegExp(CITE_SRC, "g"), "")
    .replace(/```/g, "")
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^\n_]*?\S)_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/^\s*[-*•] +/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
