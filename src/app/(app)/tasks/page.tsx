import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Download, Plus } from "lucide-react";
import { requireViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { queryTasks } from "@/lib/task-query";
import { taskFiltersSchema } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TaskFilters } from "./task-filters";
import { TaskTable } from "./task-table";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const staff = isStaff(viewer.role);
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = taskFiltersSchema.parse(flat);
  const supabase = await createClient();

  const [tasks, { data: venues }, { data: scenes }, { data: tagRows }] = await Promise.all([
    queryTasks(filters),
    supabase.from("venues").select("id, name").eq("archived", false).order("name"),
    supabase.from("scenes").select("id, name, venue_id").eq("archived", false).order("name"),
    supabase.from("tasks").select("tags").eq("archived", false),
  ]);
  const tags = [...new Set((tagRows ?? []).flatMap((t) => t.tags))].sort();
  const exportQuery = new URLSearchParams(flat as Record<string, string>).toString();

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${tasks.length} task${tasks.length === 1 ? "" : "s"}${Object.keys(flat).length ? " match these filters" : ""}.`}
        actions={
          <>
            {staff && (
              <Button asChild variant="outline">
                <a href={`/api/export/tasks?${exportQuery}`} download>
                  <Download /> Export CSV
                </a>
              </Button>
            )}
            {staff && (
              <Button asChild>
                <Link href="/tasks/new">
                  <Plus /> New task
                </Link>
              </Button>
            )}
          </>
        }
      />
      <TaskFilters venues={venues ?? []} scenes={scenes ?? []} tags={tags} />
      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No tasks found"
          description="Try clearing a filter, or create a new task."
        />
      ) : (
        <TaskTable
          canBulkEdit={staff}
          rows={tasks.map((t) => ({
            id: t.id,
            code: t.code,
            instruction: t.instruction,
            status: t.status,
            arms_required: t.arms_required,
            success_count: t.success_count,
            target_episodes: t.target_episodes,
            tags: t.tags,
            scene: t.scenes.name,
            venue: t.scenes.venues?.name ?? "",
          }))}
        />
      )}
    </>
  );
}
