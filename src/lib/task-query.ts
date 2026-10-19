import "server-only";
import { createClient } from "@/lib/supabase/server";
import { STATUS_ORDER } from "@/lib/status";
import type { TaskFilters } from "@/lib/validation";

export const TASK_LIST_SELECT =
  "id, code, instruction, status, priority, arms_required, difficulty, target_episodes, success_count, episode_count, tags, updated_at, archived, scenes!inner(id, name, venue_id, venues(id, name))";

/** Filtered task list for the table and CSV export. RLS limits rows to what the user may see. */
export async function queryTasks(filters: TaskFilters, limit = 1000) {
  const supabase = await createClient();
  let q = supabase.from("tasks").select(TASK_LIST_SELECT).limit(limit);

  q = q.eq("archived", filters.archived === "1");
  if (filters.venue) q = q.eq("scenes.venue_id", filters.venue);
  if (filters.scene) q = q.eq("scene_id", filters.scene);
  if (filters.status.length) q = q.in("status", filters.status as (typeof STATUS_ORDER)[number][]);
  if (filters.arms) q = q.eq("arms_required", Number(filters.arms));
  if (filters.tag) q = q.contains("tags", [filters.tag]);
  if (filters.q) {
    const term = filters.q.replace(/[%_,()*\\]/g, " ").trim();
    if (term) q = q.or(`instruction.ilike.%${term}%,code.ilike.%${term}%`);
  }

  const { data, error } = await q.order("code");
  if (error) throw error;
  return sortTasks(data, filters.sort);
}

export type TaskListRow = Awaited<ReturnType<typeof queryTasks>>[number];

function sortTasks<T extends { code: string; status: string; success_count: number; target_episodes: number; updated_at: string; priority: number }>(
  rows: T[],
  sort: TaskFilters["sort"],
) {
  const progress = (t: T) => t.success_count / t.target_episodes;
  const by: Record<string, (a: T, b: T) => number> = {
    code: (a, b) => a.code.localeCompare(b.code),
    "-code": (a, b) => b.code.localeCompare(a.code),
    status: (a, b) =>
      STATUS_ORDER.indexOf(a.status as never) - STATUS_ORDER.indexOf(b.status as never) || a.code.localeCompare(b.code),
    progress: (a, b) => progress(a) - progress(b),
    "-progress": (a, b) => progress(b) - progress(a),
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    priority: (a, b) => a.priority - b.priority || a.code.localeCompare(b.code),
  };
  return [...rows].sort(by[sort ?? "code"]);
}
