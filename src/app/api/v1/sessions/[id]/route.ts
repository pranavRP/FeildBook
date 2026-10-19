import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, readJson, rigHandler } from "@/lib/api/rig-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ended_at: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().max(2000).optional(),
});

/** Ends a session (ended_at defaults to now) and/or updates its notes. */
export const PATCH = rigHandler<{ id: string }>(async ({ db, rig }, request, { id }) => {
  if (!z.uuid().safeParse(id).success) return apiError(404, "session_not_found", "Session not found.");
  const body = bodySchema.parse(await readJson(request));

  const { data: session } = await db.from("sessions").select("id, rig_id, started_at, ended_at").eq("id", id).maybeSingle();
  if (!session || session.rig_id !== rig.id) return apiError(404, "session_not_found", "Session not found.");

  const endedAt = body.ended_at ?? session.ended_at ?? new Date().toISOString();
  if (new Date(endedAt) < new Date(session.started_at)) {
    return apiError(422, "validation_failed", "ended_at is before the session started.");
  }
  const { data, error } = await db
    .from("sessions")
    .update({ ended_at: endedAt, ...(body.notes !== undefined ? { notes: body.notes } : {}) })
    .eq("id", id)
    .select("id, started_at, ended_at, notes")
    .single();
  if (error) throw error;

  const { count } = await db.from("episodes").select("id", { count: "exact", head: true }).eq("session_id", id);
  return NextResponse.json({ session: { ...data, episode_count: count ?? 0 } });
});
