import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, readJson, rigHandler } from "@/lib/api/rig-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  operator_email: z.email().transform((e) => e.toLowerCase()),
  venue_id: z.uuid(),
  notes: z.string().max(2000).optional(),
});

/** Starts a recording session on this rig. */
export const POST = rigHandler(async ({ db, rig }, request) => {
  const body = bodySchema.parse(await readJson(request));

  const { data: operator } = await db
    .from("profiles")
    .select("id, role, active")
    .ilike("email", body.operator_email)
    .maybeSingle();
  if (!operator || !operator.active || operator.role === "viewer") {
    return apiError(422, "unknown_operator", "No active operator with that email.");
  }
  const { data: venue } = await db.from("venues").select("id").eq("id", body.venue_id).eq("archived", false).maybeSingle();
  if (!venue) return apiError(404, "venue_not_found", "Venue not found.");

  if (operator.role === "operator") {
    const { data: assigned } = await db
      .from("venue_assignments")
      .select("venue_id")
      .eq("venue_id", body.venue_id)
      .eq("user_id", operator.id)
      .maybeSingle();
    if (!assigned) return apiError(403, "venue_not_assigned", "This operator is not assigned to that venue.");
  }

  const { data: session, error } = await db
    .from("sessions")
    .insert({ rig_id: rig.id, operator_id: operator.id, venue_id: body.venue_id, source: "api", notes: body.notes })
    .select("id, started_at")
    .single();
  if (error) throw error;
  return NextResponse.json({ session_id: session.id, started_at: session.started_at }, { status: 201 });
});
