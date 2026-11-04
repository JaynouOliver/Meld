import { NextResponse, type NextRequest } from "next/server";

import { isStandupAgent } from "@/lib/scheduled";
import { sb } from "@/lib/store/supabase";
import { runInCtx } from "@/server/context";
import { sweepScheduled } from "@/server/scheduled";
import { contextAs } from "@/server/workspace";

/** At most this many workspaces per run (Vercel's function time limit). */
const MAX_WORKSPACES = 50;

/**
 * Daily backstop for scheduled work (vercel.json crons): due reminders in any workspace,
 * and the morning digest in active workspaces with a standup agent. Most deliveries
 * happen earlier, lazily, on the first request after they're due; this catches
 * workspaces nobody opened. Same auth as the missions cron (CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.DATA_STORE === "memory") return NextResponse.json({ swept: 0 });

  // Workspace → someone to act as: who set a due reminder, else the owner.
  const actAs = new Map<string, string | null>();
  const due = await sb().from("reminders").select("workspace_id, created_by").eq("status", "pending").lte("due_at", new Date().toISOString()).limit(500);
  if (due.error) return NextResponse.json({ error: due.error.message }, { status: 500 });
  for (const r of due.data ?? []) if (!actAs.has(r.workspace_id)) actAs.set(r.workspace_id, r.created_by);

  // Digests: workspaces with a standup agent and messages in the last three days (skips abandoned demos).
  const agents = await sb().from("agents").select("workspace_id, handle, name, description").limit(2000);
  const recent = await sb().from("messages").select("workspace_id").gt("created_at", new Date(Date.now() - 3 * 86400_000).toISOString()).limit(5000);
  if (agents.error || recent.error) return NextResponse.json({ error: (agents.error ?? recent.error)!.message }, { status: 500 });
  const active = new Set((recent.data ?? []).map((r) => r.workspace_id));
  for (const a of agents.data ?? []) if (active.has(a.workspace_id) && isStandupAgent(a) && !actAs.has(a.workspace_id)) actAs.set(a.workspace_id, null);

  const results: { workspace: string; ok: boolean; reminders?: number; digests?: number; error?: string }[] = [];
  for (const [workspace, user] of [...actAs.entries()].slice(0, MAX_WORKSPACES)) {
    try {
      const who = user ?? (await ownerOf(workspace));
      if (!who) throw new Error("No owner");
      const ctx = await contextAs(workspace, who);
      const r = await runInCtx(ctx, () => sweepScheduled({ force: true }));
      results.push({ workspace, ok: true, reminders: r.reminders.length, digests: r.digests.length });
    } catch (e) {
      results.push({ workspace, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ swept: results.length, results });
}

async function ownerOf(workspace: string): Promise<string | null> {
  const r = await sb().from("workspace_members").select("user_id").eq("workspace_id", workspace).eq("role", "owner").limit(1).maybeSingle();
  return (r.data as { user_id: string } | null)?.user_id ?? null;
}
