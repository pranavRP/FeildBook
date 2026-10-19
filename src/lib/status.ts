import type { Database } from "@/lib/database.types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];

export const STATUS_ORDER: TaskStatus[] = [
  "proposed",
  "feasibility_test",
  "feasible",
  "needs_change",
  "infeasible",
  "ready",
  "collecting",
  "done",
];

export const STATUS_META: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  proposed: {
    label: "Proposed",
    className: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/20",
    dot: "bg-slate-400",
  },
  feasibility_test: {
    label: "Feasibility test",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25",
    dot: "bg-amber-500",
  },
  feasible: {
    label: "Feasible",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/25",
    dot: "bg-sky-500",
  },
  needs_change: {
    label: "Needs change",
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-500/25",
    dot: "bg-orange-500",
  },
  infeasible: {
    label: "Infeasible",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/25",
    dot: "bg-rose-500",
  },
  ready: {
    label: "Ready",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/25",
    dot: "bg-violet-500",
  },
  collecting: {
    label: "Collecting",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/25",
    dot: "bg-blue-500",
  },
  done: {
    label: "Done",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
    dot: "bg-emerald-500",
  },
};

/**
 * Manual workflow transitions. Automatic ones are handled by DB triggers:
 * ready -> collecting (first episode), collecting -> done (target reached),
 * needs_change -> feasibility_test (new instruction version).
 */
export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  proposed: ["ready", "feasibility_test"],
  feasibility_test: ["feasible", "needs_change", "infeasible"],
  feasible: ["ready", "needs_change"],
  needs_change: [],
  infeasible: ["proposed"],
  ready: ["proposed"],
  collecting: ["done"],
  done: ["collecting"],
};

export const FEASIBILITY_RESULTS: TaskStatus[] = ["feasible", "needs_change", "infeasible"];

export function canTransition(from: TaskStatus, to: TaskStatus) {
  return TRANSITIONS[from].includes(to);
}

export const FAILURE_REASONS = [
  "Grasp slip",
  "Collision",
  "Reach limit",
  "Timeout",
  "Operator error",
  "Other",
] as const;
