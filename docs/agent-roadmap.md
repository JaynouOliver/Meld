# Agents: roadmap and architecture

Working list for the agent side of Meld. We build one feature at a time, test it in
the UI and with evals, then tick it off. UI work happens in parallel on `main`.

## Feature list

| # | Feature | Status |
|---|---|---|
| 1 | **Ticket CRUD by tagging Atlas** (create, update, bulk, delete, ask-when-ambiguous, role-aware) | ✅ Done: Muse Spark 1.3 + tools, 14/14 evals |
| 2 | **Status answers with sources**: "where's the Apple Pay launch?" from tickets, PRs and threads, with links | ✅ Done: `ticket_discussion` tool, server-verified citations, jump-to-message chips; 18/18 evals |
| 3 | **Blocker propagation**: "X blocks Y" or a blocked ticket notifies downstream owners once | ✅ Done: ticket dependencies (panel + Atlas), owners get one Atlas DM per change (blocked, unblocked, reopened, parked, deleted), loops refused; 27/27 evals |
| 4 | **Thread → tickets**: "@Atlas make tickets from this" with a preview card before creating | ✅ Done: owners from the thread, existing tickets updated instead of re-filed, 2+ new tickets wait on a preview card; 23/23 evals |
| 5 | **Quiet action-item capture**: private "make this a ticket?" suggestion to the author | To do: needs the memory pipeline |
| 6 | **"What did I miss?"** per-person catch-up | To do: needs summaries |
| 7 | **Decision log** with links to where each decision was made | To do: needs fact extraction |
| 8 | **GitHub automation**: merged PR → Done, failed CI posts, stale review nudges | To do: webhooks |
| 9 | **Standups and digests** (daily team digest, weekly sprint summary, release notes) | To do: scheduler |
| 10 | **Onboarding brief**: "catch Diego up on #platform-eng" | To do |
| 11 | **Duplicate detection** when creating tickets | ✅ Done: `create_ticket` refuses near-duplicates of open tickets (title word overlap) unless `allow_duplicate` |
| 12 | **Confirm cards + undo** for deletes, bulk edits and cross-channel posts | ✅ Done: changes staged per run; deletes and 3+ ticket edits wait for Confirm; everything else gets 10-min Undo; 21/21 evals |
| 13 | **Voice notes → tickets** with Muse Voice Transcribe | Idea |

### Platform work underneath

| Item | Status |
|---|---|
| Server-side data + Atlas behind the existing API (`/api/rpc`) | ✅ Done (in-memory; resets on restart) |
| Eval harness (`npm run eval:atlas`) | ✅ Done |
| Persistent storage: Postgres + append-only event log | To do: needed before deploying (serverless loses in-memory state) |
| Memory pipeline: thread/channel summaries, facts, search index | To do |
| Async Atlas on a job queue (`agent_runs`): post returns at once, reply arrives over realtime, "Atlas is working…" for everyone | ✅ Done: see architecture.md §4 "As built" |
| Streaming replies (token by token) | To do |
| Trace viewer (context, tool calls, tokens per Atlas run) | To do: traces are logged today |
| Real auth (role from the session, not the request) | ✅ Done: GitHub/Google sign-in (Supabase Auth); roles from workspace membership |
| Multi-tenant workspaces: onboarding, invites, members, channels, DMs | ✅ Done |
| Deploy (Vercel preview per branch) | To do: needs your Vercel account |

## How Atlas works now

```
chat message ──► /api/rpc/postMessage ──► (mentions @Atlas?) ──► /api/rpc/askAtlas
                                                                   │
            ┌──────────────────────────────────────────────────────┘
            ▼
  context assembly (src/server/atlas/prompt.ts)
    stable system prompt + tool schemas   ← cached by Meta's prefix cache
    where / who / role rules
    tickets the requester can see         ← filtered by role in code
    recent conversation or the thread
            ▼
  tool loop on muse-spark-1.3 (src/server/atlas/run.ts, ≤ 8 steps, parallel tools)
    list_tickets · get_ticket · create_ticket · update_ticket · delete_ticket · search_messages
    permissions enforced in tools (src/server/atlas/tools.ts), not in the prompt
            ▼
  reply in the conversation (+ ticket card), "Update on NW-…" posted to the
  ticket's channel, activity logged as "Atlas (asked by …)"
```

Measured on the seed workspace: ~5k input tokens per request with ~85–95% served from
cache, 3–6 s per request at low reasoning effort, about $0.003 per request.

## Models (Meta Model API)

| Model | $ / 1M in · out | Use in Meld |
|---|---|---|
| `muse-spark-1.3` | 1.25 · 4.25 (cached in 0.15) | Atlas and anything interactive. Low effort for chat CRUD |
| `muse-wonder-1.0` | 4.00 · 20.00 | Heavy multi-ticket orchestration and sub-agent fan-out |
| `muse-spark-1.3-contributor` | 0.10 · 0.20 | Background workers, **only if** we're OK with Meta training on our content |
| `muse-voice-transcribe-1.0` | $0.18 / hour | Voice notes → tickets |
| `muse-image-1.0` | $0.01 / image | Not needed yet |

Switch Atlas's model or effort with `ATLAS_MODEL` / `ATLAS_REASONING_EFFORT`.

## Memory: how we'll store it as chats grow

Ticket state lives in the database and is always read live; memory is only for what
the chat alone knows. Every derived item keeps the message IDs it came from.

| Layer | Contents | Built by | Used by Atlas |
|---|---|---|---|
| Event log | Every message, ticket change, webhook, with ACLs | App writes | Searched on demand |
| Summaries | Thread → day → "state of the channel" | Worker after every N messages (incremental) | Always included for the current thread/channel |
| Facts | Decisions, action items, blockers, owners, deadlines (valid from/to) | Extraction worker with structured outputs | Pulled in when relevant |
| Ticket store | Status, assignee, links, dependencies | App | Live via tools |
| Agent notes | Team conventions ("QA" means In review) | Atlas, via a notes tool | Loaded each run |

Meta's API has no embeddings endpoint, so search is Postgres full-text search over
messages and summaries, with Atlas refining queries through `search_messages`.

## Decisions we need

1. Is Contributor mode OK for background workers (12x cheaper, Meta may train on content)?
2. Vercel + Postgres (Neon) for a shareable deploy: who owns the accounts?
3. May agents post without being tagged (blockers, nudges)? Where, and how often?
