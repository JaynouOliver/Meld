import { NextResponse, type NextRequest } from "next/server";

import { sb } from "@/lib/store/supabase";
import { runInCtx } from "@/server/context";
import { checkInMission } from "@/server/missions";
import { contextAs } from "@/server/workspace";

/**
 * Daily mission check-ins (vercel.json crons). Every active mission that hasn't been
 * checked in on for 20 hours gets one, run as the person who started it. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without that secret configured this does nothing.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.DATA_STORE === "memory") return NextResponse.json({ checked: 0 });

  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data, error } = await sb()
    .from("missions")
    .select("id, workspace_id, created_by, last_checkin_at")
    .in("status", ["active", "at_risk"])
    .or(`last_checkin_at.is.null,last_checkin_at.lt.${since}`)
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const m of data ?? []) {
    try {
      if (!m.created_by) throw new Error("No owner");
      const ctx = await contextAs(m.workspace_id, m.created_by);
      await runInCtx(ctx, () => checkInMission(m.id, ctx.dir.role));
      results.push({ id: m.id, ok: true });
    } catch (e) {
      results.push({ id: m.id, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ checked: results.length, results });
}
