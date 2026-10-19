import "server-only";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/server-env";
import { STATUS_ORDER, type TaskStatus } from "@/lib/status";

export type DashboardData = {
  kpis: { label: string; value: number; suffix?: string; href?: string }[];
  days: { day: string; label: string; success: number; unsuccessful: number }[];
  totals: { episodes: number; successes: number };
  byStatus: Record<TaskStatus, number>;
  venues: { name: string; success: number; target: number; tasks: number }[];
  closest: { id: string; code: string; instruction: string; success_count: number; target_episodes: number }[];
  activity: (
    | { kind: "episode"; key: string; at: string; who: string; outcome: string; reason: string | null; code: string; rig: string }
    | { kind: "version"; key: string; at: string; who: string; code: string; version: number; reason: string | null }
  )[];
};

/** Everything the dashboard shows, as plain JSON. RLS limits it to what the viewer may see. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const [{ data: tasks }, { data: daily }, { data: recent }, { data: versions }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, code, instruction, status, success_count, target_episodes, scenes(venues(id, name))")
      .eq("archived", false),
    supabase.rpc("dashboard_daily", { p_days: 14, p_tz: serverEnv.timezone }),
    supabase
      .from("episodes")
      .select("id, outcome, failure_reason, created_at, tasks(code), sessions(profiles(full_name), rigs(name))")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("task_versions")
      .select("version, change_reason, created_at, tasks(code), profiles(full_name)")
      .gt("version", 1)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const all = tasks ?? [];
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, all.filter((t) => t.status === s).length])) as Record<
    TaskStatus,
    number
  >;
  const days = (daily ?? []).map((d) => ({
    day: d.day,
    label: format(new Date(`${d.day}T12:00:00`), "MMM d"),
    success: d.success,
    unsuccessful: d.failure + d.aborted,
  }));
  const today = days[days.length - 1];
  const successes = days.reduce((n, d) => n + d.success, 0);
  const episodes = days.reduce((n, d) => n + d.success + d.unsuccessful, 0);

  const venues = new Map<string, DashboardData["venues"][number]>();
  for (const t of all) {
    const v = t.scenes?.venues;
    if (!v || !["ready", "collecting", "done"].includes(t.status)) continue;
    const row = venues.get(v.id) ?? { name: v.name, success: 0, target: 0, tasks: 0 };
    row.success += Math.min(t.success_count, t.target_episodes);
    row.target += t.target_episodes;
    row.tasks++;
    venues.set(v.id, row);
  }

  const activity: DashboardData["activity"] = [
    ...(recent ?? []).map((e) => ({
      kind: "episode" as const,
      key: e.id,
      at: e.created_at,
      who: e.sessions?.profiles?.full_name ?? "Someone",
      outcome: e.outcome,
      reason: e.failure_reason,
      code: e.tasks?.code ?? "",
      rig: e.sessions?.rigs?.name ?? "No rig",
    })),
    ...(versions ?? []).map((v) => ({
      kind: "version" as const,
      key: `${v.tasks?.code}-v${v.version}`,
      at: v.created_at,
      who: v.profiles?.full_name ?? "Import",
      code: v.tasks?.code ?? "",
      version: v.version,
      reason: v.change_reason,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 9);

  return {
    kpis: [
      { label: "Total tasks", value: all.length, href: "/tasks" },
      { label: "Ready", value: byStatus.ready, href: "/tasks?status=ready" },
      { label: "Collecting", value: byStatus.collecting, href: "/tasks?status=collecting" },
      { label: "Done", value: byStatus.done, href: "/tasks?status=done" },
      { label: "Episodes today", value: (today?.success ?? 0) + (today?.unsuccessful ?? 0) },
      { label: "Success rate · 14d", value: episodes ? Math.round((successes / episodes) * 100) : 0, suffix: "%" },
    ],
    days,
    totals: { episodes, successes },
    byStatus,
    venues: [...venues.values()],
    closest: all
      .filter((t) => t.status === "collecting")
      .sort((a, b) => a.target_episodes - a.success_count - (b.target_episodes - b.success_count))
      .slice(0, 5)
      .map(({ id, code, instruction, success_count, target_episodes }) => ({ id, code, instruction, success_count, target_episodes })),
    activity,
  };
}
