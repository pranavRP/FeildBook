import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TaskForm } from "../task-form";
import { taskFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ scene?: string }> }) {
  await requireViewer(["admin", "designer"]);
  const { scene } = await searchParams;
  const { scenes, propNames } = await taskFormOptions();
  return (
    <>
      <PageHeader title="New task" description="It gets a permanent code (T-0000) when you save." />
      <TaskForm scenes={scenes} propNames={propNames} defaultSceneId={scenes.some((s) => s.id === scene) ? scene : undefined} />
    </>
  );
}
