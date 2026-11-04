/**
 * Jump to old messages (no model calls): npm run test:chatgaps
 * The around-window in the memory store (a chat longer than the 100-conversation window),
 * the service's access check and bounds, merging windows into the loaded history
 * (dedupe, order, the gap, refetches of the latest window), and focus resolution.
 */
import assert from "node:assert/strict";

import * as api from "../src/lib/api/service";
import { mergeLatest, mergeWindow, reachedStart, resolveFocus, splice, type History } from "../src/lib/chat-history";
import { setCtxProvider, type RequestCtx } from "../src/lib/context";
import { ATLAS, ATLAS_AGENT, type Directory } from "../src/lib/directory";
import { memoryStore } from "../src/lib/store/memory";
import type { Message } from "../src/lib/types";

const person = (id: string, name: string) => ({ id, name, first: name, initials: name[0], color: "#000", team: null, isAgent: false });
const dir: Directory = {
  workspace: { id: "ws-gaps", name: "Test", slug: "test", ticketPrefix: "T", repo: null },
  me: "ada", role: "member", personOrder: ["ada", "bo", "atlas"], teams: [],
  people: { ada: person("ada", "Ada"), bo: person("bo", "Bo"), atlas: ATLAS },
  agents: [ATLAS_AGENT],
  chats: {
    long: { id: "long", kind: "channel", label: "long", topic: "", team: null, members: ["ada", "bo"] },
  },
  channels: ["long"], dms: [], home: "long", memberships: [], demo: false,
};
const store = memoryStore("ws-gaps", "T");
const ctx: RequestCtx = { dir, store };
setCtxProvider(() => ctx);

let passed = 0;
async function test(name: string, fn: () => unknown) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const ids = (list: { id: string }[]) => list.map((m) => m.id);
const msg = (id: string, text = id, replies: string[] = []): Message => ({
  id, who: "ada", time: "10:00 AM", text, replies: replies.map((r) => ({ id: r, who: "bo", time: "10:01 AM", text: r })),
});
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => msg(`c${a + i}`));

async function main() {
  // 130 top-level messages; c5 has two replies, so a search hit can be a reply.
  for (let i = 1; i <= 130; i++) {
    await store.appendMessage("long", { id: `c${i}`, who: i % 2 ? "ada" : "bo", time: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString(), text: `message number ${i}` });
  }
  await store.appendMessage("long", { id: "r5a", who: "bo", time: new Date().toISOString(), text: "first reply to five" }, "c5");
  await store.appendMessage("long", { id: "r5b", who: "ada", time: new Date().toISOString(), text: "second reply to five" }, "c5");

  // ---------------------------------------------------------------- store and service

  await test("the latest window leaves the early conversations out", async () => {
    const latest = await store.listMessages("long");
    assert.equal(latest.length, 100);
    assert.equal(latest[0].id, "c31");
    assert.ok(!latest.some((m) => m.id === "c5"));
  });

  await test("around a top-level message: before + itself + after, oldest first, with replies", async () => {
    const win = await store.listMessagesAround("long", "c10", 3, 2);
    assert.deepEqual(ids(win), ["c7", "c8", "c9", "c10", "c11", "c12"]);
    const all = await store.listMessagesAround("long", "c6", 30, 30);
    assert.deepEqual(ids(all)[0], "c1", "clamped at the chat's start");
    assert.equal(all.length, 5 + 1 + 30);
    assert.deepEqual(ids(all.find((m) => m.id === "c5")!.replies), ["r5a", "r5b"]);
  });

  await test("around a reply centers on its thread root", async () => {
    const win = await store.listMessagesAround("long", "r5b", 1, 1);
    assert.deepEqual(ids(win), ["c4", "c5", "c6"]);
  });

  await test("load older / newer shapes, and the chat's end", async () => {
    assert.deepEqual(ids(await store.listMessagesAround("long", "c31", 3, 0)), ["c28", "c29", "c30", "c31"]);
    assert.deepEqual(ids(await store.listMessagesAround("long", "c128", 0, 5)), ["c128", "c129", "c130"]);
    assert.deepEqual(await store.listMessagesAround("long", "nope", 3, 3), []);
    assert.deepEqual(await store.listMessagesAround("other-chat", "c5", 3, 3), [], "the id must be in that chat");
  });

  await test("service: bounds and access", async () => {
    const win = await api.getMessagesAround("long", "c50", 500, -4);
    assert.equal(win.length, 50, "before is capped at 100 (only 49 older exist), after floors at 0");
    assert.equal(win[win.length - 1].id, "c50");
    // The directory holds only chats the viewer can see; anything else is a 404.
    await assert.rejects(api.getMessagesAround("private-elsewhere", "c5"), (e: unknown) => e instanceof api.ApiError && e.status === 404);
  });

  // ---------------------------------------------------------------- merging into the loaded history

  const empty = (messages: Message[]): History => ({ messages, gapAfter: null });

  await test("splice: overlapping windows dedupe by id and keep order; the window wins its span", () => {
    const seg = range(5, 10);
    assert.deepEqual(ids(splice(seg, range(2, 7))), ids(range(2, 10)));
    assert.deepEqual(ids(splice(seg, range(9, 12))), ids(range(5, 12)));
    const edited = [msg("c6", "edited"), msg("c8")]; // c7 was deleted
    const out = splice(seg, edited);
    assert.deepEqual(ids(out), ["c5", "c6", "c8", "c9", "c10"]);
    assert.equal(out[1].text, "edited");
  });

  await test("jump to an older, disjoint window: it goes first, with a gap before the latest", () => {
    const h = mergeWindow(empty(range(31, 130)), range(1, 20));
    assert.deepEqual(ids(h.messages), [...ids(range(1, 20)), ...ids(range(31, 130))]);
    assert.equal(h.gapAfter, "c20");
    assert.equal(new Set(ids(h.messages)).size, h.messages.length, "no duplicates");
  });

  await test("a window overlapping the latest window joins it without a gap", () => {
    const h = mergeWindow(empty(range(31, 130)), range(10, 40));
    assert.deepEqual(ids(h.messages), ids(range(10, 130)));
    assert.equal(h.gapAfter, null);
  });

  await test("load newer at the gap: extends the older segment, then closes the gap", () => {
    let h = mergeWindow(empty(range(61, 130)), range(1, 10));
    assert.equal(h.gapAfter, "c10");
    h = mergeWindow(h, range(10, 40));
    assert.equal(h.gapAfter, "c40");
    assert.deepEqual(ids(h.messages), [...ids(range(1, 40)), ...ids(range(61, 130))]);
    h = mergeWindow(h, range(40, 70));
    assert.equal(h.gapAfter, null);
    assert.deepEqual(ids(h.messages), ids(range(1, 130)));
  });

  await test("load older prepends to the older segment and keeps the gap", () => {
    let h = mergeWindow(empty(range(61, 130)), range(20, 30));
    h = mergeWindow(h, range(5, 20));
    assert.deepEqual(ids(h.messages), [...ids(range(5, 30)), ...ids(range(61, 130))]);
    assert.equal(h.gapAfter, "c30");
  });

  await test("a second far jump replaces the older segment (one gap at most)", () => {
    let h = mergeWindow(empty(range(101, 130)), range(1, 10));
    h = mergeWindow(h, range(50, 60));
    assert.deepEqual(ids(h.messages), [...ids(range(50, 60)), ...ids(range(101, 130))]);
    assert.equal(h.gapAfter, "c60");
  });

  await test("a refetch of the latest window keeps the history loaded before it", () => {
    // Older segment + gap + latest; two new messages arrived and c129 was deleted.
    const h = mergeWindow(empty(range(31, 130)), range(1, 20));
    const fresh = [...range(33, 128), msg("c130"), msg("c131"), msg("c132")];
    const out = mergeLatest(h, fresh, true);
    // c31 and c32 slid out of the latest window but were loaded: they stay, before it.
    assert.deepEqual(ids(out.messages), [...ids(range(1, 20)), "c31", "c32", ...ids(fresh)]);
    assert.equal(out.gapAfter, "c20");
    assert.ok(!out.messages.some((m) => m.id === "c129"), "deleted in the latest span");
    // Contiguous history: everything older than the fresh window stays.
    const joined = mergeLatest(empty(range(1, 130)), range(31, 131), true);
    assert.deepEqual(ids(joined.messages), ids(range(1, 131)));
  });

  await test("without loaded history a refetch is a plain replace (and a pending message goes, as before)", () => {
    const out = mergeLatest(empty([...range(1, 5), msg("pending-1")]), range(2, 6), false);
    assert.deepEqual(ids(out.messages), ids(range(2, 6)));
    const far = mergeLatest(mergeWindow(empty(range(31, 130)), range(1, 20)), range(300, 399), true);
    assert.deepEqual(ids(far.messages), ids(range(300, 399)), "too far behind: start over from the latest");
    assert.equal(far.gapAfter, null);
  });

  // ---------------------------------------------------------------- focus resolution

  await test("focus: loaded root, loaded reply (opens its thread), missing, stale thread hint", async () => {
    const list = [msg("c4"), msg("c5", "five", ["r5a", "r5b"]), msg("c6")];
    assert.deepEqual(resolveFocus(list, { chatId: "long", threadId: null, id: "c6" }), { status: "ready", rootId: "c6", threadId: null });
    assert.deepEqual(resolveFocus(list, { chatId: "long", threadId: "c5", id: "r5b" }), { status: "ready", rootId: "c5", threadId: "c5" });
    assert.deepEqual(resolveFocus(list, { chatId: "long", threadId: null, id: "r5a" }), { status: "ready", rootId: "c5", threadId: "c5" });
    assert.deepEqual(resolveFocus(list, { chatId: "long", threadId: null, id: "c1" }), { status: "missing" });
  });

  await test("end to end: a search hit outside the window resolves after merging its window", async () => {
    const hits = await api.searchMessages("second reply");
    const hit = hits.find((h) => h.id === "r5b");
    assert.ok(hit, "search finds the old reply");
    let h = empty(await api.getMessages("long"));
    const focus = { chatId: hit.chatId, threadId: hit.threadId, id: hit.id };
    assert.equal(resolveFocus(h.messages, focus).status, "missing");
    const win = await api.getMessagesAround("long", hit.id, 30, 30);
    h = mergeWindow(h, win);
    assert.deepEqual(resolveFocus(h.messages, focus), { status: "ready", rootId: "c5", threadId: "c5" });
    assert.deepEqual(ids(h.messages).slice(0, 3), ["c1", "c2", "c3"]);
    assert.equal(h.gapAfter, null, "c5 + 30 reaches c35, inside the latest window (c31..): no gap");
    assert.equal(new Set(ids(h.messages)).size, 130);
    assert.ok(reachedStart(win, hit.id, 30), "fewer than 30 older: this is the chat's start");
    assert.ok(!reachedStart(await api.getMessagesAround("long", "c80", 30, 0), "c80", 30));
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
