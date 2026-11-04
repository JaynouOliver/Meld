# Chat gaps: search on phones, jump to old messages

No new demo seed: both features work on any workspace. The Orbit Labs sandbox chats are
shorter than the 100-conversation window, so "jump to old messages" only shows once a
channel has more history (see "How to show it" below).

## 1. Search on phones

- **Status:** built.
- **What it does:** the Cmd/Ctrl+K search palette (channels, people, tickets, messages)
  now has a search button in the phone headers of Home and every chat. On phones it opens
  as a full-screen sheet with a Cancel button; tapping a result opens the channel, the
  ticket sheet, or jumps to the message.
- **Where it shows:** any screen, phone width (under 768px). Home header (next to your
  avatar) and the chat header (first icon on the right).
- **How to show it (about 20 s):**
  1. On a phone (or a 390px-wide browser), open Home.
  2. Tap the magnifier at the top right. The search sheet fills the screen, keyboard up.
  3. Type `onboarding` (or a ticket id like `ORB-3`). Channels, tickets and messages list.
  4. Tap a message result: the chat opens with that message highlighted. Tap a ticket
     result: the ticket opens as a sheet.
- **Desktop:** unchanged (sidebar search button, Cmd/Ctrl+K). The palette is now mounted
  once in the app shell instead of inside the sidebar, so phones can reach it; desktop
  still has exactly one instance.
- **Limits:** the Tickets, Missions and You tabs don't have the button (Home and chats do).

## 2. Jump to old messages

- **Status:** built (Load older and Load newer included).
- **What it does:** a chat loads only its latest 100 conversations. Before, a citation
  chip, search result, Pinned entry or Decisions link to anything older did nothing. Now
  Meld fetches the conversation around that message (30 before, 30 after), merges it into
  the chat, scrolls to it, flashes it, and opens its thread if it's a reply. While you read
  older history a "Jump to latest" button floats over the list; "Load older messages"
  appears at the top (and loads by itself when you scroll there), and "Load newer messages"
  marks any gap between the history you jumped to and the latest messages.
- **Where it shows:** any chat longer than the loaded window (the boot payload holds 30
  conversations per chat, a chat's own window 100).
- **How to show it (about 1 min):**
  1. Make a long channel. In the browser console on the app (signed in), run:
     ```js
     for (let i = 1; i <= 125; i++) await fetch('/api/rpc/postMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [{ chatId: location.pathname.split('/').pop(), text: `Ledger backfill note ${String(i).padStart(3, '0')}` }] }) });
     ```
     (on the channel you want; it takes about 10 s). Reload.
  2. Press Cmd/Ctrl+K (or the phone search button) and type `003`.
  3. Click "Ledger backfill note 003". The chat scrolls back to it and highlights it for
     two seconds. "Jump to latest" shows at the bottom right; a "Load newer messages"
     divider marks the unloaded stretch.
  4. Click "Jump to latest" to go back to the newest message.
  5. Scroll to the very top: older conversations load (the button shows while loading).
  - Pin an early message, scroll down, and pick it from the header's Pinned list: same jump.
- **Server:** new store method `listMessagesAround(chatId, messageId, before, after)`
  (memory store and Supabase), rpc `getMessagesAround`, and SQL function
  `public.chat_window_around` in `supabase/migrations/20261111090000_chat_around.sql`
  (additive; `chat_window` is untouched). **The migration must be applied** before this
  works on the Supabase store.
- **Limits:**
  - At most one unloaded gap is kept: a second jump far from the first replaces the older
    stretch you loaded rather than keeping a patchwork.
  - History you loaded older than the latest window isn't refreshed by realtime (edits or
    reactions others make there show after reopening the chat). Your own edits, pins and
    reactions there update immediately.
  - If more than a whole window of new messages arrives between refreshes, the chat starts
    over from the latest messages (the older stretch is dropped).
  - The divider at the top still says "Today" for the latest window and "Earlier" once
    history is loaded; there are no per-day dividers.
  - A link to a message that was deleted shows "That message isn't available any more".

## Tests

`npm run test:chatgaps` (15 checks): the around-window on a 130-conversation chat in the
memory store (top-level and reply targets, start and end of the chat, bounds, access),
window merging (dedupe, order, the gap, Load older/newer, refetch of the latest window),
and focus resolution, including a search hit outside the window end to end.
