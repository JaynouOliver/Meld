# Meld as an agent-native workspace

Status: design + build plan. Companion to [architecture.md](architecture.md) and
[agent-roadmap.md](agent-roadmap.md).

## Why

"Slack + a Jira bot" makes people the context mules: they copy bug reports, ticket ids and
PR links between chat, trackers and terminals. The bot only wakes when tagged, has no
memory of its own and can't work with other bots.

Meld already has the pieces to do better: a job queue for agent work (`agent_runs`),
per-request workspace context and permissions, live progress over realtime, and a
tool-using agent (Atlas). This plan turns "one built-in bot" into **agents as workspace
members**, with scoped context, inter-agent delegation and an open protocol (MCP) so any
agent (Claude Code, Codex, a custom harness) can join a team.

## Principles

1. **Agents are members, not webhooks.** Profile, handle, DM inbox, presence (idle /
   working), and a visible place in each channel's roster.
2. **No covert scraping.** An agent reads only channels it has been added to, plus DMs
   with it. The roster shows every agent that can read a channel. Atlas is the one
   exception: it's in every channel by default (mention-only), as today, and can be removed.
3. **Asynchronous by default.** Everything an agent is asked to do is a queued run in its
   inbox (`agent_runs` with `agent_id`), never a blocking request.
4. **Humans stay in charge of risk.** Agents act with the requester's permissions;
   destructive or bulk changes still wait for a human's Confirm (unchanged).
5. **Bounded autonomy.** Loop governors cap how far agents can wake each other.

## Concepts

| Concept | What it is | Stored in |
|---|---|---|
| Agent | A member that runs on a model: name, `@handle`, role, instructions, allowed tools, kind (`builtin` Atlas, `custom` prompt agent, `external` MCP client) | `agents` |
| Channel membership | Which agents can read a channel, and how forward they are | `channel_agents (chat_id, agent_id, mode)` |
| Proactivity mode | `mention`: only when tagged. `lurk`: reads along, speaks up only on a trigger (a question it can answer, an error, a blocker). `active`: may chime in on any message it can help with | `channel_agents.mode` |
| Inbox | The agent's queue of work: mentions, DMs, delegated tasks, proactive checks | `agent_runs` + `agent_id`, `depth`, `parent_run_id`, `trigger` |
| Triage reaction | 👀 on the message an agent picked up, replaced by its reply | `messages.reactions` |

## Flows

```
human message ─► save (sync) ─► who should look at it?
                                 ├─ @handle of a member agent ........ run (trigger=mention)
                                 ├─ DM with an agent ................. run (trigger=dm)
                                 └─ channel agents in lurk/active .... triage run (cheap model call:
                                                                       "should I respond?" → stop or full run)
agent reply ─► save ─► mentions other agents? ─► run (trigger=delegation, depth+1)  [governed]
```

**Delegation.** Agents hand work to each other by @mentioning them in a reply ("@reviewer
can you check the edge cases?"), exactly like people do. The delegated run gets the thread
as context, and the requester's permissions travel with it (a run never gains permissions
by being delegated).

**Loop governor** (server, per run):
- An agent's own message never wakes itself.
- Agent → agent wakes need an explicit @mention (no proactive triage on agent messages).
- `depth` grows by one per hop; at depth 3 the chain stops and the agent says it's handing
  back to a human.
- Rate limit: at most 8 agent runs per chat per 5 minutes; further triggers are dropped
  (mentions get a short "I'm rate-limited here" reply).

**Scoped context.** Context assembly and every read tool (`search_messages`,
`ticket_discussion`, `catch_up`, citations) filter to chats where the agent is a member
**and** the requester can see. DMs: only the DM the agent is in.

## External agents over MCP (phase 2)

`POST /api/mcp`: a Streamable-HTTP MCP server. An owner creates an **external agent** and
gets a token (shown once, stored hashed). Then, for example:

```
claude mcp add --transport http meld https://meld-fawn.vercel.app/api/mcp \
  --header "Authorization: Bearer <token>"
```

Tools: `inbox` (mentions/DMs/delegations waiting for this agent), `read_channel`,
`post_message` (as the agent, optionally in a thread), `list_tickets`, `get_ticket`,
`create_ticket`, `update_ticket`, `ack` (mark inbox items done). The same membership,
scoping and governor rules apply; the agent shows up in rosters and gets 👀 / replies like
any other member.

## Later phases

- **Memory**: vector + full-text recall of decisions and resolved threads (pgvector),
  feeding context assembly (architecture.md §5).
- **Huddles / transcripts**: speech-to-text into a thread, then agents act on it.
- **Bridges**: federate a channel with another workspace; partner agents see only that
  channel, never internal tools or prompts.

## Build order

1. **Phase 1 (now)**: agents table and UI (create, edit, DM), channel membership + modes,
   generalized agent runtime (persona, tool scopes, scoped context), mentions of any agent,
   proactive triage for lurk/active, delegation + loop governor, 👀 reactions, presence.
2. **Phase 2**: MCP server + external agents with tokens.
3. **Phase 3**: memory store, transcripts, bridges.

## Missions

A mission is a goal with a date that the agents drive to done (`src/server/missions`).

1. **Plan** (`planner.ts`). From the goal, the channel's recent conversation, the people, the agents in the channel and the open tickets, Atlas drafts 3 to 9 tasks with owners, dates and dependencies (reusing open tickets), up to 2 decisions only a person can make, and the risks. The plan streams: each task appears on the board as soon as the model closes it. Everything the model returns is checked against the workspace (owners, dates clamped to the deadline, dependencies, ticket ids).
2. **Launch.** Tasks become tickets (`mission_id`, `due`, dependencies as `blockedBy`, watching the mission thread). Owners are announced in the mission's thread; agent owners are handed their task there and start a run.
3. **Check in** (button, or daily via `/api/cron/missions` with `CRON_SECRET`). Late work gets a new date and everything waiting on it moves after it; owners of late or ready work are nudged; the finish is forecast. If the forecast misses the deadline the mission goes *at risk* and the person who started it gets a date-or-scope decision. Only work that finishes past the deadline and that nothing waits on is offered as a cut.
4. **Decide.** Slip decisions carry their effect (`actions`: move the deadline, cut a ticket, keep the date) and are applied directly. Product decisions from the plan are posted in the thread as the person's message and handed to Atlas to apply.
5. **Done** when every remaining ticket is done; announced in the thread.

Tests: `npm run test:missions` (no model). The demo sandbox seeds "Launch paid plans" with a day-late task, so one check-in shows the whole loop.
