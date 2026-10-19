import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ClipboardList, Pencil, Plus, Ruler, RotateCcw, TriangleAlert } from "lucide-react";
import { requireViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/signed-urls";
import { uuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { PhotoUploader } from "@/components/photos/photo-uploader";
import { StatusBadge } from "@/components/tasks/status-badge";
import { TaskProgress } from "@/components/tasks/task-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SceneDialog } from "../../scene-dialog";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!uuid.safeParse(id).success) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("scenes").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Scene" };
}

export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const viewer = await requireViewer();
  const staff = isStaff(viewer.role);
  const supabase = await createClient();

  const { data: scene } = await supabase
    .from("scenes")
    .select(
      "*, venues(id, name), scene_photos(id, kind, caption, storage_path, thumb_path, width, height, created_at), tasks(id, code, instruction, status, success_count, target_episodes, arms_required, archived)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!scene) notFound();

  const photos = await signPhotos(
    [...scene.scene_photos].sort(
      (a, b) =>
        Number(b.kind === "reference") - Number(a.kind === "reference") || a.created_at.localeCompare(b.created_at),
    ),
  );
  const tasks = scene.tasks.filter((t) => !t.archived).sort((a, b) => a.code.localeCompare(b.code));
  const canUpload = staff || viewer.role === "operator";

  const [{ data: venues }, { data: siblings }] = staff
    ? await Promise.all([
        supabase.from("venues").select("id, name").eq("archived", false).order("name"),
        supabase.from("scenes").select("id, name").eq("archived", false).neq("id", scene.id).order("name"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <PageHeader
        eyebrow={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/venues" className="hover:text-foreground">
              Venues
            </Link>
            <ChevronRight className="size-3" />
            <span>{scene.venues?.name}</span>
          </nav>
        }
        title={scene.name}
        actions={
          <>
            {staff && (
              <SceneDialog
                scene={scene}
                venues={venues ?? []}
                trigger={
                  <Button variant="outline">
                    <Pencil /> Edit
                  </Button>
                }
              />
            )}
            {canUpload && <PhotoUploader sceneId={scene.id} sceneName={scene.name} />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PhotoGallery
            photos={photos}
            canEdit={staff}
            scenes={scene.name === "Unsorted" ? (siblings ?? []) : undefined}
          />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Tasks in this scene</h2>
              {staff && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/tasks/new?scene=${scene.id}`}>
                    <Plus /> New task
                  </Link>
                </Button>
              )}
            </div>
            {tasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No tasks in this scene yet" className="py-8" />
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tasks/${t.code}`}
                      className="flex flex-col gap-2 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
                      <span className="min-w-0 flex-1 text-sm">{t.instruction}</span>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={t.status} />
                        <TaskProgress success={t.success_count} target={t.target_episodes} className="w-36" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About this scene</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="whitespace-pre-line text-muted-foreground">{scene.description || "No description yet."}</p>
              {scene.surface_height_in !== null && (
                <div className="flex items-center gap-2">
                  <Ruler className="size-4 text-muted-foreground" />
                  Surface height <span className="font-medium tabular">{scene.surface_height_in}&Prime;</span>
                </div>
              )}
            </CardContent>
          </Card>
          <InfoCard icon={TriangleAlert} title="Clearance notes" text={scene.clearance_notes} />
          <InfoCard icon={RotateCcw} title="Reset instructions" text={scene.reset_instructions} />
        </aside>
      </div>
    </>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm whitespace-pre-line text-muted-foreground">{text || "None recorded."}</CardContent>
    </Card>
  );
}
