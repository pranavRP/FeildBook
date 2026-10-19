import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, readJson, rigHandler, type RigContext } from "@/lib/api/rig-auth";
import { FAILURE_REASONS } from "@/lib/status";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    external_id: z.uuid(),
    session_id: z.uuid(),
    task_code: z.string().regex(/^T-\d{4,}$/, "Expected a task code like T-0042"),
    outcome: z.enum(["success", "failure", "aborted"]),
    failure_reason: z.string().trim().max(200).optional(),
    duration_s: z.number().nonnegative().max(86_400).optional(),
    data_uri: z.string().trim().max(2000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((b) => b.outcome === "success" || !!b.failure_reason || b.outcome === "aborted", {
    path: ["failure_reason"],
    message: `failure_reason is required for failures (e.g. ${FAILURE_REASONS.join(", ")})`,
  });

const EPISODE_SELECT =
  "id, external_id, session_id, task_version, outcome, failure_reason, duration_s, data_uri, metadata, created_at, tasks(code, status, success_count, target_episodes)";

async function existing(db: RigContext["db"], externalId: string) {
  const { data } = await db.from("episodes").select(EPISODE_SELECT).eq("external_id", externalId).maybeSingle();
  return data;
}

function present(e: NonNullable<Awaited<ReturnType<typeof existing>>>) {
  const { tasks, ...rest } = e;
  return {
    ...rest,
    task_code: tasks?.code,
    task: tasks && {
      status: tasks.status,
      success_count: tasks.success_count,
      target_episodes: tasks.target_episodes,
      remaining_episodes: Math.max(0, tasks.target_episodes - tasks.success_count),
    },
  };
}

/** Logs an episode. Idempotent on external_id: a retry returns the original row with 200. */
export const POST = rigHandler(async ({ db, rig }, request) => {
  const body = bodySchema.parse(await readJson(request));

  const prior = await existing(db, body.external_id);
  if (prior) return NextResponse.json({ episode: present(prior), created: false }, { status: 200 });

  const { data: session } = await db
    .from("sessions")
    .select("id, rig_id, venue_id, ended_at")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session || session.rig_id !== rig.id) return apiError(404, "session_not_found", "Session not found.");
  if (session.ended_at) return apiError(409, "session_ended", "That session has ended.");

  const { data: task } = await db
    .from("tasks")
    .select("id, status, archived, current_version, scenes!inner(venue_id)")
    .eq("code", body.task_code)
    .maybeSingle();
  if (!task || task.archived) return apiError(404, "task_not_found", "Task not found.");
  if (task.scenes.venue_id !== session.venue_id) {
    return apiError(422, "task_not_in_venue", "That task belongs to a different venue than the session.");
  }
  if (!["ready", "collecting", "done"].includes(task.status)) {
    return apiError(409, "task_not_ready", `Task is ${task.status}; only ready/collecting tasks take episodes.`);
  }

  const { data: inserted, error } = await db
    .from("episodes")
    .insert({
      external_id: body.external_id,
      session_id: session.id,
      task_id: task.id,
      task_version: task.current_version,
      outcome: body.outcome,
      failure_reason: body.outcome === "success" ? null : (body.failure_reason ?? null),
      duration_s: body.duration_s ?? null,
      data_uri: body.data_uri ?? null,
      metadata: { ...(body.metadata ?? {}), rig: rig.name },
    })
    .select(EPISODE_SELECT)
    .single();

  if (error?.code === "23505") {
    // Lost a race with a concurrent retry: return the winner.
    const winner = await existing(db, body.external_id);
    if (winner) return NextResponse.json({ episode: present(winner), created: false }, { status: 200 });
  }
  if (error) throw error;
  return NextResponse.json({ episode: present(inserted), created: true }, { status: 201 });
});
