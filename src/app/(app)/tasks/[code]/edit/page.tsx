import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskForm } from "../../task-form";
import { taskFormOptions } from "../../form-data";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ code: string }> }) {
  await requireViewer(["admin", "designer"]);
  const { code } = await params;
  if (!/^T-\d{4,}$/.test(code)) notFound();
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("*, task_props(qty, source, acquired, props(name))")
    .eq("code", code)
    .maybeSingle();
  if (!task) notFound();
  const { scenes, propNames } = await taskFormOptions();

  return (
    <>
      <PageHeader eyebrow={task.code} title="Edit task" description={`Currently version ${task.current_version}.`} />
      <TaskForm
        scenes={scenes}
        propNames={propNames}
        task={{
          id: task.id,
          code: task.code,
          scene_id: task.scene_id,
          instruction: task.instruction,
          priority: task.priority,
          arms_required: task.arms_required,
          max_prop_weight_g: task.max_prop_weight_g,
          difficulty: task.difficulty,
          target_episodes: task.target_episodes,
          feasibility_notes: task.feasibility_notes,
          notes: task.notes,
          tags: task.tags,
          props: task.task_props.map((p) => ({
            name: p.props?.name ?? "",
            qty: p.qty,
            source: p.source,
            acquired: p.acquired,
          })),
        }}
      />
    </>
  );
}
