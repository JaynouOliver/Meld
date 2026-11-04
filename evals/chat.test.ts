/**
 * Chat depth (no model calls): npm run test:chat
 * Edit/delete permissions (own vs others', owners, agent messages, deleted roots with
 * replies), pins, reactions, the search visibility filter, and the message formatter.
 */
import assert from "node:assert/strict";

import * as api from "../src/lib/api/service";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { parseInline, parseMessage, type Block, type InlinePart } from "../src/lib/markdown";
import { deleteInList, editInList, pinInList, reactInList, visibleHits } from "../src/lib/message-ops";
import { memoryStore } from "../src/lib/store/memory";
import type { Message, Role } from "../src/lib/types";

const person = (id: string, name: string, isAgent = false) => ({ id, name, first: name, initials: name[0], color: "#000", team: null, isAgent });

const baseDir: Directory = {
  workspace: { id: "ws-chat", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "ada", role: "member", personOrder: ["ada", "bo", "cy", "atlas"], teams: [],
  people: { ada: person("ada", "Ada"), bo: person("bo", "Bo"), cy: person("cy", "Cy"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: {
    general: { id: "general", kind: "channel", label: "general", topic: "", team: null, members: ["ada", "bo", "cy"] },
    "dm-ada-atlas": { id: "dm-ada-atlas", kind: "dm", who: "atlas", topic: "" },
  },
  channels: ["general"], dms: ["dm-ada-atlas"], home: "general", memberships: [], demo: false,
};
const store = memoryStore("ws-chat", "T");
let ctx: RequestCtx = { dir: baseDir, store };
setCtxProvider(() => ctx);
/** Act as someone with a role. */
const as = (me: string, role: Role) => {
  ctx = { dir: { ...baseDir, me, role }, store };
};

let n = 0;
const post = async (chatId: string, who: string, text: string, threadId?: string) => {
  const m = await store.appendMessage(chatId, { id: `m${++n}`, who, time: new Date().toISOString(), text }, threadId);
  return m.id;
};
const rejects = async (p: Promise<unknown>, status: number, why: string) => {
  await assert.rejects(p, (e: unknown) => e instanceof api.ApiError && e.status === status, why);
};
const find = async (chatId: string, id: string) => {
  const list = await store.listMessages(chatId);
  for (const m of list) {
    if (m.id === id) return m;
    const r = m.replies.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
};

async function permissions() {
  const mine = await post("general", "ada", "hello");
  const bos = await post("general", "bo", "hi from bo");
  const atlas = await post("general", "atlas", "Filed T-1.");

  // Edit: only your own, never an agent's.
  as("ada", "member");
  const edited = await api.editMessage({ id: mine, text: "  hello, edited  " });
  assert.equal(edited.text, "hello, edited");
  assert.equal(edited.chatId, "general");
  const after = await find("general", mine);
  assert.equal(after?.text, "hello, edited");
  assert.ok(after?.editedAt, "edit stamps editedAt");
  await rejects(api.editMessage({ id: bos, text: "hijack" }), 403, "can't edit someone else's message");
  await rejects(api.editMessage({ id: mine, text: "   " }), 400, "empty edit is refused");
  as("ada", "owner");
  await rejects(api.editMessage({ id: bos, text: "owner edit" }), 403, "owners can't edit others' words either");
  await rejects(api.editMessage({ id: atlas, text: "fake Atlas" }), 403, "nobody edits an agent's message");

  // Delete: your own; owners anyone's; agent messages only by owners.
  as("bo", "member");
  await rejects(api.deleteMessage({ id: mine }), 403, "members can't delete others' messages");
  await rejects(api.deleteMessage({ id: atlas }), 403, "members can't delete agent messages");
  as("ada", "owner");
  await rejects(api.deleteMessage({ id: atlas, role: "member" }), 403, "an owner viewing as member acts as a member");
  await api.deleteMessage({ id: atlas });
  assert.equal(await find("general", atlas), null, "owner deleted the agent message");
  await api.deleteMessage({ id: bos });
  assert.equal(await find("general", bos), null, "owner deleted someone else's message");
  as("ada", "guest");
  await api.deleteMessage({ id: mine });
  assert.equal(await find("general", mine), null, "anyone can delete their own message, guests too");
  await rejects(api.deleteMessage({ id: "nope" }), 404, "unknown message");

  // A chat the person can't see answers like an unknown message.
  const hidden = await post("secret", "bo", "private");
  as("ada", "owner");
  await rejects(api.editMessage({ id: hidden, text: "x" }), 404, "hidden chat");
  await rejects(api.deleteMessage({ id: hidden }), 404, "hidden chat");
  console.log("  edit/delete permissions ok");
}

async function deletedRoots() {
  as("ada", "member");
  const root = await post("general", "ada", "Thread starter");
  const r1 = await post("general", "bo", "reply one", root);
  const r2 = await post("general", "ada", "reply two", root);
  await api.pinMessage({ id: root, on: true });
  await api.toggleReaction({ id: root, emoji: "🎉", on: true });

  await api.deleteMessage({ id: root });
  const tomb = (await find("general", root)) as Message;
  assert.ok(tomb, "root with replies stays as a placeholder");
  assert.ok(tomb.deletedAt);
  assert.equal(tomb.text, "", "its words are gone");
  assert.equal(tomb.pinnedAt, null, "and its pin");
  assert.deepEqual(tomb.reactions, {}, "and its reactions");
  assert.equal(tomb.replies.length, 2, "the thread survives");
  await rejects(api.deleteMessage({ id: root }), 403, "a placeholder can't be deleted again");
  await rejects(api.editMessage({ id: root, text: "back" }), 403, "or edited");
  await rejects(api.pinMessage({ id: root, on: true }), 410, "or pinned");
  await rejects(api.toggleReaction({ id: root, emoji: "👍", on: true }), 410, "or reacted to");
  const hits = await api.searchMessages("thread starter");
  assert.ok(!hits.some((h) => h.id === root), "deleted text isn't searchable");

  // Replies can be deleted; the placeholder goes away with the last one.
  await api.deleteMessage({ id: r2 });
  assert.equal(((await find("general", root)) as Message).replies.length, 1);
  as("bo", "member");
  await api.deleteMessage({ id: r1 });
  assert.equal(await find("general", root), null, "empty placeholder removed");

  // A root without replies is just removed.
  as("ada", "member");
  const lone = await post("general", "ada", "no replies");
  await api.deleteMessage({ id: lone });
  assert.equal(await find("general", lone), null);
  console.log("  deleted roots ok");
}

async function pins() {
  as("ada", "member");
  const a = await post("general", "bo", "Launch is Friday");
  const b = await post("general", "ada", "Runbook lives in the wiki");
  const reply = await post("general", "cy", "Rollback plan in here", b);
  const p1 = await api.pinMessage({ id: a, on: true });
  assert.equal(p1.pinnedBy, "ada");
  await new Promise((r) => setTimeout(r, 5));
  await api.pinMessage({ id: reply, on: true });
  let pinned = await api.getPinned("general");
  assert.deepEqual(pinned.map((x) => x.id), [reply, a], "newest pin first; replies can be pinned");
  assert.equal(pinned[0].threadId, b, "a pinned reply knows its thread");
  assert.equal(((await find("general", a)) as Message).pinnedBy, "ada");

  as("cy", "guest");
  await rejects(api.pinMessage({ id: a, on: false }), 403, "guests can't pin or unpin");
  as("bo", "member");
  await api.pinMessage({ id: a, on: false });
  pinned = await api.getPinned("general");
  assert.deepEqual(pinned.map((x) => x.id), [reply], "unpinned");
  assert.equal(((await find("general", a)) as Message).pinnedAt, null);
  await rejects(api.getPinned("secret"), 404, "pins of a chat you can't see");

  // Reactions toggle per person.
  await api.toggleReaction({ id: a, emoji: "👍", on: true });
  as("ada", "member");
  await api.toggleReaction({ id: a, emoji: "👍", on: true });
  await api.toggleReaction({ id: a, emoji: "👍", on: true });
  assert.deepEqual(((await find("general", a)) as Message).reactions, { "👍": ["bo", "ada"] }, "no double reactions");
  await api.toggleReaction({ id: a, emoji: "👍", on: false });
  assert.deepEqual(((await find("general", a)) as Message).reactions, { "👍": ["bo"] });
  await rejects(api.toggleReaction({ id: a, emoji: "<b>x</b> hi", on: true }), 400, "not a reaction");
  console.log("  pins and reactions ok");
}

async function search() {
  as("ada", "member");
  await post("general", "bo", "The deploy pipeline is green");
  await post("dm-ada-atlas", "atlas", "Your deploy finished");
  await post("dm-bo-cy", "cy", "deploy secrets between bo and cy");
  await post("secret", "bo", "deploy the secret channel");
  const hits = await api.searchMessages("deploy");
  const chats = new Set(hits.map((h) => h.chatId));
  assert.ok(chats.has("general") && chats.has("dm-ada-atlas"), "your channels and DMs");
  assert.ok(!chats.has("dm-bo-cy"), "never someone else's DM");
  assert.ok(!chats.has("secret"), "never a chat outside your directory");
  assert.deepEqual(await api.searchMessages(" a "), [], "one-letter queries search nothing");

  // The filter itself: own-property lookup, empty text dropped, more matched words first.
  const raw = [
    { chatId: "general", text: "deploy" },
    { chatId: "toString", text: "deploy pipeline" },
    { chatId: "general", text: "" },
    { chatId: "general", text: "deploy pipeline green" },
  ];
  assert.deepEqual(
    visibleHits(raw, baseDir.chats, ["deploy", "pipeline", "green"]).map((h) => h.text),
    ["deploy pipeline green", "deploy"],
    "prototype keys aren't chats",
  );
  console.log("  search visibility ok");
}

function cacheUpdates() {
  const list: Message[] = [
    { id: "a", who: "ada", time: "", text: "root", replies: [{ id: "a1", who: "bo", time: "", text: "r" }] },
    { id: "b", who: "bo", time: "", text: "lone", replies: [] },
  ];
  assert.equal(editInList(list, "a1", "new", "t")[0].replies[0].text, "new");
  assert.equal(list[0].replies[0].text, "r", "cache updates don't mutate");
  const d1 = deleteInList(list, "a", "t");
  assert.equal(d1.length, 2);
  assert.equal(d1[0].deletedAt, "t", "root with replies becomes a placeholder");
  assert.deepEqual(deleteInList(d1, "a1", "t").map((m) => m.id), ["b"], "last reply takes the placeholder with it");
  assert.deepEqual(deleteInList(list, "b", "t").map((m) => m.id), ["a"]);
  assert.deepEqual(reactInList(list, "b", "🔥", "ada", true)[1].reactions, { "🔥": ["ada"] });
  assert.equal(pinInList(list, "a1", "t", "ada")[0].replies[0].pinnedBy, "ada");
  console.log("  cache updates ok");
}

// ---------------------------------------------------------------- formatting

/** Compact view of inline parts: "b:text" for bold, "i:" italic, "bi:" both, "code:", "link:", "@", "#", "cite". */
const view = (parts: InlinePart[]) =>
  parts.map((p) => {
    const m = `${p.bold ? "b" : ""}${p.italic ? "i" : ""}`;
    const tag = p.kind === "text" ? m : p.kind === "mention" ? `${m}@` : p.kind === "ticket" ? `${m}#` : p.kind === "cite" ? `${m}cite` : `${m}${p.kind}`;
    return tag ? `${tag}:${p.kind === "link" ? p.href : p.text}` : p.text;
  });
const inline = (s: string) => view(parseInline(s, "NW"));
const kinds = (blocks: Block[]) => blocks.map((b) => b.kind);

function formatting() {
  // Plain text, mentions, tickets and citations behave exactly as before.
  assert.deepEqual(inline("hey @Atlas see NW-12."), ["hey ", "@:@Atlas", " see ", "#:NW-12", "."]);
  assert.deepEqual(inline("[[cite:general:-:m_1]]"), ["cite:[[cite:general:-:m_1]]"]);

  assert.deepEqual(inline("**bold** and _it_"), ["b:bold", " and ", "i:it"]);
  assert.deepEqual(inline("**_both_**"), ["bi:both"]);
  assert.deepEqual(inline("**ship NW-12 with @bo**"), ["b:ship ", "b#:NW-12", "b: with ", "b@:@bo"], "chips keep working inside bold");

  // Code spans are literal: no bold, no mentions, no tickets inside.
  assert.deepEqual(inline("run `a **b** @atlas NW-1` now"), ["run ", "code:a **b** @atlas NW-1", " now"]);
  assert.deepEqual(inline("```inline fence```"), ["code:inline fence"]);
  assert.deepEqual(inline("**`code` in bold**"), ["bcode:code", "b: in bold"]);

  // Underscores: snake_case and URLs stay as they are.
  assert.deepEqual(inline("set max_retry_count to 3"), ["set max_retry_count to 3"]);
  assert.deepEqual(inline("see https://example.com/a_b_c/d_e."), ["see ", "link:https://example.com/a_b_c/d_e", "."]);
  assert.deepEqual(inline("_read https://x.io/a_b_"), ["i:read ", "ilink:https://x.io/a_b"]);
  assert.deepEqual(inline("(https://en.wikipedia.org/wiki/Foo_(bar))"), ["(", "link:https://en.wikipedia.org/wiki/Foo_(bar)", ")"]);
  assert.deepEqual(inline("(see https://x.io/a)"), ["(see ", "link:https://x.io/a", ")"]);
  assert.deepEqual(inline("javascript:alert(1) is not a link"), ["javascript:alert(1) is not a link"]);

  // Citations next to formatting; a citation's underscores never italicize.
  assert.deepEqual(inline("**Done**[[cite:c_1:-:m_2]]"), ["b:Done", "cite:[[cite:c_1:-:m_2]]"]);
  assert.deepEqual(inline("_per [[cite:c_1:t_2:m_3]]_"), ["i:per ", "icite:[[cite:c_1:t_2:m_3]]"]);

  // Unmatched or spaced markers stay literal.
  assert.deepEqual(inline("2 * 3 ** 4 and ** not bold **"), ["2 * 3 ** 4 and ** not bold **"]);
  assert.deepEqual(inline("a _ b _ c"), ["a _ b _ c"]);
  assert.deepEqual(inline("**unclosed"), ["**unclosed"]);

  // Blocks: a plain message is one paragraph, newlines kept.
  const plain = parseMessage("line one\n\nline two", "NW");
  assert.deepEqual(kinds(plain), ["para"]);
  assert.deepEqual(view((plain[0] as Extract<Block, { kind: "para" }>).parts), ["line one\n\nline two"]);
  assert.deepEqual(kinds(parseMessage("", "NW")), ["para"]);

  // Fenced code keeps its contents verbatim, even markers and mentions.
  const code = parseMessage("Try this:\n```ts\nconst a = **b**; // @atlas\n  indented\n```\nthen _ship_", "NW");
  assert.deepEqual(kinds(code), ["para", "code", "para"]);
  assert.equal((code[1] as Extract<Block, { kind: "code" }>).text, "const a = **b**; // @atlas\n  indented");
  const open = parseMessage("```\nstill streaming", "NW");
  assert.deepEqual(kinds(open), ["code"], "an unclosed fence runs to the end");

  // Lists, nested by two-space indents; items are formatted inline.
  const list = parseMessage("Plan:\n- **one** NW-1\n  - nested _a_\n    - deeper\n- two\n\nDone.", "NW");
  assert.deepEqual(kinds(list), ["para", "list", "para"]);
  const items = (list[1] as Extract<Block, { kind: "list" }>).items;
  assert.equal(items.length, 2);
  assert.deepEqual(view(items[0].parts), ["b:one", " ", "#:NW-1"]);
  assert.deepEqual(view(items[0].children[0].parts), ["nested ", "i:a"]);
  assert.deepEqual(view(items[0].children[0].children[0].parts), ["deeper"]);
  assert.deepEqual(view((list[2] as Extract<Block, { kind: "para" }>).parts), ["Done."], "blank lines around blocks are spacing");
  assert.deepEqual(kinds(parseMessage("-1 degrees\n---", "NW")), ["para"], "not bullets");
  console.log("  formatting ok");
}

async function main() {
  await permissions();
  await deletedRoots();
  await pins();
  await search();
  cacheUpdates();
  formatting();
  console.log("chat: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
