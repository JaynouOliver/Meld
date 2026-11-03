# Meld system design: messages, queues and agent context

Status: proposal for review. Companion to [agent-roadmap.md](agent-roadmap.md).

## 1. Principles

1. **The message table is the source of truth, written synchronously.** A user's message is
   durable before we say "sent". Everything else (agents, summaries, alerts, search)
   happens asynchronously off a queue.
2. **Enqueue in the same transaction as the write** (transactional outbox). A message can't be
   saved without its follow-up jobs, or vice versa. No dual writes.
3. **Agents never read "the whole chat".** They get a small, budgeted, permission-filtered
   context assembled from layered memory, plus tools to dig deeper.
4. **Every derived thing points back to its source** (message ids, sequence ranges), so answers
   can cite, and stale memory can be detected and corrected.

## 2. Why the queue goes behind the database, not in front

A few hundred messages per second is well within one Postgres instance (thousands of
small inserts per second). Putting a queue in front of the write would mean acknowledging
messages before they're stored, re-solving ordering and read-after-write, and adding a hop.
The real load is what each message triggers: model calls (slow, rate-limited, costly),
summaries, embeddings, notifications. That work belongs on queues.

We'd move to a log-first write path (Kafka/Redpanda partitioned by channel, wide-column
storage) only at sustained tens of thousands of messages per second or multi-region writes.
The design below keeps that door open: messages carry client ids and per-channel sequence
numbers, which is what a partitioned log needs too.

## 3. Write path

```
browser ──POST /api/rpc/postMessage {clientId (ULID), chatId, text}──► API (Vercel, dub1)
                                                                          │ one transaction
                                                                          ▼
                    ┌──────────── Postgres (Supabase, eu-west-1) ─────────────────┐
                    │ INSERT messages (seq = next per chat; id = clientId)         │
                    │   └─ trigger: pgmq.send('agent'  …) if @mention / DM to Atlas │
                    │               pgmq.send('memory' …) always (cheap, debounced) │
                    │               realtime.send('chat:<id>', 'message', {id,seq}) │
                    └──────────────────────────────────────────────────────────────┘
                                                                          │
                     ◄── 200 {id, seq} (≈ 20–60 ms in-region) ────────────┘
```

- **Idempotent:** the browser generates the message id (ULID). A retry after a timeout
  inserts nothing new (`on conflict do nothing`), and the optimistic copy reconciles by id.
- **Ordering:** `seq` is a per-chat counter assigned in the insert. Everything downstream
  (summaries, "covered until") uses it instead of timestamps.
- **Fan-out:** the database trigger broadcasts over Supabase Realtime directly, so the API
  doesn't do it (removes a step from the request).

## 4. Queues and workers

Supabase Queues (`pgmq`): Postgres-native, exactly-once delivery within a visibility
timeout, retries when a worker dies, and an archive for dead letters.

| Queue | Producer | Consumer | Latency target | Notes |
|---|---|---|---|---|
| `agent` | @mention, DM to Atlas, confirm-card clicks | Atlas run | start < 1 s | User is waiting. Pushed to the worker immediately (`pg_net` HTTP call on enqueue), with a `pg_cron` sweep every 10 s as backup. Concurrency capped for Meta rate limits. |
| `memory` | every message | summarizer, fact extractor, embedder | seconds–minutes | **Debounced per chat:** run when ≥ 20 new messages or 60 s idle. One model call covers a batch. |
| `watch` | ticket changes, PR/CI webhooks, extracted blockers | blocker propagation, nudges | < 1 min | Deduplicated by (rule, ticket). Posts at most once per change. |
| `dead` | jobs that failed 5 times | humans / trace viewer | n/a | Kept for debugging and replay. |

**Worker runtime:** a Vercel route `/api/worker/<queue>`, protected by a shared secret and
called by `pg_net` (push) and `pg_cron` (sweep). This keeps all agent code in one TypeScript
codebase. Each call drains a small batch within the 60 s function limit.

**Atlas becomes asynchronous.** Posting a mention returns immediately; the job runs in the
worker; the reply arrives over Realtime. Run status (`queued → thinking → calling tools →
done`) is a row in `agent_runs`, broadcast so the UI can show "Atlas is working…" for
everyone, not just the sender. This also removes the request-timeout risk on slow model calls.

**No duplicates:** each job's idempotency key is its trigger message id; a per-thread
advisory lock means one Atlas run per thread at a time; tool writes carry the run id.

### As built (agent queue, v1)

- **Queue = the `agent_runs` table.** `postMessage` saves the message and, if it addresses
  Atlas, enqueues a run in the same request (`trigger_message_id` is unique, so a retried
  request never runs twice). The response returns immediately.
- **Worker = the same function, after the response** (`after()` from `next/server`,
  `maxDuration = 300`). `claim_agent_run()` is one conditional `UPDATE`, so only one worker
  can take a run.
- **Self-healing instead of `pg_cron` for now:** browsers poll `getAgentRuns` while a run is
  in flight; that call sweeps runs that were never picked up (> 10 s) or whose worker died
  (> 5 min), up to 2 attempts. A retried run checks for its reply (deterministic id) first.
- **Status for everyone:** runs broadcast a `runs` ping on enqueue/start/finish; every tab
  shows "Atlas is working…" in that chat or thread, and refetches when it finishes.
- Still to do from the design above: `pgmq` + `pg_net` push, per-thread locks, the `memory`
  and `watch` queues.

## 5. Memory: how chats are stored for agents

```
                        ┌─ hot window ── last 30–50 messages of the chat/thread (indexed by chat, seq)
messages (seq) ─────────┼─ segments ──── conversation split by 30-min gaps or every 50 messages;
                        │                 each has a summary + covered seq range
                        ├─ channel state ─ rolling "where things stand" built from segment summaries
                        ├─ facts ──────── decisions, action items, blockers, questions, owners, due dates
                        │                 (typed rows, source message ids, status, supersedes)
                        ├─ mentions ───── message ↔ ticket links (NW-123 references) → "everything about NW-130"
                        └─ search ─────── Postgres full-text + pgvector embeddings (gte-small, generated
                                          in Supabase Edge Functions; no external embeddings API needed)
tickets ───────────────── live state, always read through tools, never from memory
```

- **Incremental, never re-summarize everything:** new summary = f(previous summary, messages
  after its `covered_until_seq`). Cost grows with new messages, not chat length.
- **Never stale:** the context assembler always adds the raw messages after the latest
  summary's `covered_until_seq`, so a lagging worker costs a few extra tokens, not wrong answers.
- **Facts are corrected, not overwritten:** a reversed decision gets a new row that supersedes
  the old one; queries read the current one, history stays auditable.
- **Permissions:** every layer is scoped (workspace › channel › thread › ticket); retrieval
  filters by the requester's access before ranking.

## 6. Reading context: what Atlas sees per request

Assembled per run, with a token budget per section (approximate):

| Section | Budget | Source | Cached? |
|---|---|---|---|
| Instructions, tools, workspace roster | ~2.5k | static | Yes (Meta prefix cache, ~90% hit today) |
| Who's asking and their permissions | ~0.1k | session | — |
| Channel state + current segment summary | ~1.5k | `summaries` | — |
| Thread (full if short, else summary + last 20) or last 30 channel messages | ~2–3k | `messages` | — |
| Open facts for this scope (decisions, blockers, action items) | ~1k | `facts` | — |
| Retrieved snippets for the request (hybrid search, top 8) | ~1.5k | search | — |
| Live state of mentioned/relevant tickets | ~1k | `tickets` | — |

Atlas can drill down with tools (`search_messages`, `get_thread`, `get_ticket`,
`ticket_history`) instead of us stuffing more in up front. Total stays ~10k tokens whether a
channel has 50 messages or 500,000.

## 7. Data model additions

```sql
messages      + seq bigint (per chat), client-generated id, unique (chat_id, seq)
agent_runs    (id, trigger_message_id unique, chat_id, thread_id, status, model, context_refs jsonb,
               tool_calls jsonb, tokens jsonb, started_at, finished_at, error)
summaries     (id, scope: thread|segment|channel, scope_id, chat_id, from_seq, to_seq, text,
               model, created_at)
facts         (id, kind: decision|action_item|blocker|question, text, owner, due, status,
               chat_id, source_message_ids text[], ticket_id, supersedes_id, created_at)
message_tickets (message_id, ticket_id)          -- NW-123 references
message_embeddings (message_id, embedding vector(384))
queues: pgmq 'agent', 'memory', 'watch'          -- plus pgmq archive as dead letters
```

## 8. Scale and cost notes

- Per message: 1 insert + 1–2 enqueues in one transaction, 1 realtime broadcast.
- Memory processing: ~1 model call per 20–50 messages per chat (summary + facts in one
  structured-output call). On `muse-spark-1.3` that's a fraction of a cent; Contributor mode
  would cut it ~12x if acceptable.
- Embeddings: free (gte-small in Supabase Edge Functions), 384 dimensions.
- Atlas: ~10k input tokens per run, ~90% cached → ~$0.003 per run.

## 9. Build order

1. **Async write path:** client ids, per-chat `seq`, trigger → `pgmq` + Realtime from the
   database; `agent` queue + worker; Atlas runs async with `agent_runs` status.
2. **Memory v1:** `memory` queue, segment + channel summaries, facts, message↔ticket links;
   context assembler uses them.
3. **Search:** embeddings via Edge Function + hybrid search with permission filtering.
4. **Watchers:** blocker propagation, PR/CI automation, nudges, digests.

## 10. Open questions

1. Atlas replies arriving asynchronously (seconds later, via realtime): OK? (Recommended.)
2. Embeddings via Supabase's built-in gte-small (English-focused, free): OK?
3. Passive features (action-item capture, blocker detection) mean workers read every message
   in channels. Fine for this workspace?
