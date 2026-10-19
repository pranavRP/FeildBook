"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, getViewer } from "@/lib/auth";
import { ActionError, check, must, runAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { canTransition, FEASIBILITY_RESULTS, type TaskStatus } from "@/lib/status";
import { taskSchema, taskStatusSchema, uuid } from "@/lib/validation";

const STAFF = ["admin", "designer"] as const;

function revalidateTask(code?: string) {
  revalidatePath("/tasks");
  if (code) revalidatePath(`/tasks/${code}`);
  revalidatePath("/venues", "layout");
  revalidatePath("/");
}

export async function createTask(input: unknown) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const { props, change_reason, ...values } = taskSchema.parse(input);
    const supabase = await createClient();
    const task = must(
      await supabase
        .from("tasks")
        .insert({ ...values, version_change_reason: change_reason ?? "Created" })
        .select("id, code")
        .single(),
    );
    check(await supabase.rpc("save_task_props", { p_task_id: task.id, p_props: props }));
    revalidateTask(task.code);
    return task.code;
  });
}

export async function updateTask(id: string, input: unknown) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    // Status changes go through the workflow buttons, not the edit form.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { props, change_reason, status, ...values } = taskSchema.parse(input);
    const supabase = await createClient();
    const current = must(await supabase.from("tasks").select("instruction").eq("id", uuid.parse(id)).single());
    const instructionChanged = current.instruction !== values.instruction;
    if (instructionChanged && !change_reason) {
      throw new ActionError("Say why the instruction changed (it becomes a new version).");
    }
    const task = must(
      await supabase
        .from("tasks")
        .update({ ...values, version_change_reason: instructionChanged ? change_reason : null })
        .eq("id", id)
        .select("id, code")
        .single(),
    );
    check(await supabase.rpc("save_task_props", { p_task_id: task.id, p_props: props }));
    revalidateTask(task.code);
    return task.code;
  });
}

/** Manual workflow step for staff; only transitions allowed by the workflow. */
export async function setTaskStatus(id: string, status: string) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const next = taskStatusSchema.parse(status) as TaskStatus;
    const supabase = await createClient();
    const task = must(await supabase.from("tasks").select("status, code").eq("id", uuid.parse(id)).single());
    if (!canTransition(task.status, next)) {
      throw new ActionError(`Can't move a task from ${task.status} to ${next}.`);
    }
    must(await supabase.from("tasks").update({ status: next }).eq("id", id).select("id").single());
    revalidateTask(task.code);
  });
}

/** Feasibility result: staff anywhere, operators on assigned venues (enforced in the RPC). */
export async function recordFeasibility(id: string, result: string, notes: string | null) {
  return runAction(async () => {
    await assertRole(["admin", "designer", "operator"]);
    const parsed = z.enum(FEASIBILITY_RESULTS as [TaskStatus, ...TaskStatus[]]).parse(result);
    const supabase = await createClient();
    const task = must(
      await supabase.rpc("set_task_feasibility", {
        p_task_id: uuid.parse(id),
        p_result: parsed,
        p_notes: z.string().trim().max(2000).nullable().parse(notes) ?? undefined,
      }),
    );
    revalidateTask(task.code);
  });
}

/** Bulk status change from the task table (staff override; not limited to workflow steps). */
export async function bulkSetStatus(ids: string[], status: string) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsedIds = z.array(uuid).min(1).max(500).parse(ids);
    const next = taskStatusSchema.parse(status) as TaskStatus;
    const supabase = await createClient();
    const rows = must(await supabase.from("tasks").update({ status: next }).in("id", parsedIds).select("id"));
    revalidateTask();
    return rows.length;
  });
}

export async function setTaskArchived(id: string, archived: boolean) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const supabase = await createClient();
    const task = must(
      await supabase.from("tasks").update({ archived }).eq("id", uuid.parse(id)).select("code").single(),
    );
    revalidateTask(task.code);
  });
}

/** Duplicate warning: instructions with trigram similarity > 0.5. */
export async function findSimilarTasks(text: string, excludeId?: string) {
  const q = z.string().trim().min(8).max(1000).safeParse(text);
  if (!q.success) return [];
  if (!(await getViewer())) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("similar_tasks", {
    p_query: q.data,
    p_threshold: 0.5,
    p_exclude: excludeId && uuid.safeParse(excludeId).success ? excludeId : undefined,
  });
  return data ?? [];
}
