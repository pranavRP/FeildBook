import { NextResponse } from "next/server";
import { z } from "zod";
import { rigHandler } from "@/lib/api/rig-auth";
import { signPaths } from "@/lib/signed-urls";
import { STATUS_ORDER, type TaskStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  venue_id: z.uuid().optional(),
  status: z
    .string()
    .default("ready,collecting")
    .transform((s) => s.split(",").map((x) => x.trim()))
    .pipe(z.array(z.enum(STATUS_ORDER as [TaskStatus, ...TaskStatus[]])).min(1)),
});

/** Tasks available to record, limited to what this rig's arm count can do. */
export const GET = rigHandler(async ({ db, rig }, request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { venue_id, status } = querySchema.parse(params);

  let q = db
    .from("tasks")
    .select(
      "code, instruction, status, current_version, arms_required, success_count, target_episodes, scenes!inner(id, name, venue_id, reset_instructions, venues(id, name), scene_photos(storage_path, kind, created_at))",
    )
    .eq("archived", false)
    .in("status", status)
    .lte("arms_required", rig.arms)
    .order("priority")
    .order("code");
  if (venue_id) q = q.eq("scenes.venue_id", venue_id);
  const { data, error } = await q;
  if (error) throw error;

  const photoFor = (s: (typeof data)[number]["scenes"]) =>
    [...s.scene_photos].sort(
      (a, b) => Number(b.kind === "reference") - Number(a.kind === "reference") || a.created_at.localeCompare(b.created_at),
    )[0]?.storage_path;
  const urls = await signPaths(data.map((t) => photoFor(t.scenes)));

  return NextResponse.json({
    tasks: data.map((t) => {
      const photo = photoFor(t.scenes);
      return {
        code: t.code,
        instruction: t.instruction,
        version: t.current_version,
        status: t.status,
        arms_required: t.arms_required,
        venue: t.scenes.venues ? { id: t.scenes.venues.id, name: t.scenes.venues.name } : null,
        scene: { id: t.scenes.id, name: t.scenes.name, reset_instructions: t.scenes.reset_instructions },
        photo_url: photo ? (urls.get(photo) ?? null) : null,
        photo_url_expires_in: photo ? 300 : null,
        success_count: t.success_count,
        target_episodes: t.target_episodes,
        remaining_episodes: Math.max(0, t.target_episodes - t.success_count),
      };
    }),
  });
});
