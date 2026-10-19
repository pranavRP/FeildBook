import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import {
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Dumbbell,
  Gauge,
  Hand,
  History,
  ImageOff,
  Package,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { requireViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/signed-urls";
import { diffWords } from "@/lib/diff";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/tasks/status-badge";
import { TaskProgress } from "@/components/tasks/task-progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TaskWorkflow } from "./task-workflow";

const CODE = /^T-\d{4,}$/;

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: CODE.test(code) ? code : "Task" };
}

export default async function TaskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE.test(code)) notFound();
  const viewer = await requireViewer();
  const staff = isStaff(viewer.role);
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "*, scenes(id, name, venue_id, reset_instructions, clearance_notes, venues(name), scene_photos(storage_path, kind, created_at)), task_props(qty, source, acquired, props(name)), task_versions(version, instruction, change_reason, created_at, profiles(full_name, email))",
    )
    .eq("code", code)
    .maybeSingle();
  if (!task || !task.scenes) notFound();

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, outcome, failure_reason, duration_s, task_version, created_at, sessions(profiles(full_name), rigs(name))")
    .eq("task_id", task.id)
    .order("created_at", { ascending: false })
    .limit(15);

  const scene = task.scenes;
  const photo = [...scene.scene_photos].sort(
    (a, b) => Number(b.kind === "reference") - Number(a.kind === "reference") || a.created_at.localeCompare(b.created_at),
  )[0];
  const photoUrl = photo ? (await signPaths([photo.storage_path])).get(photo.storage_path) : undefined;
  const versions = [...task.task_versions].sort((a, b) => b.version - a.version);
  const atScene = task.task_props.filter((p) => p.source === "at_scene");
  const toBuy = task.task_props.filter((p) => p.source === "to_buy");
  const successRate = task.episode_count ? Math.round((task.success_count / task.episode_count) * 100) : null;
  const canRecordFeasibility = staff || viewer.role === "operator";

  return (
    <>
      <PageHeader
        eyebrow={
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1">
            <Link href="/tasks" className="hover:text-foreground">
              Tasks
            </Link>
            <ChevronRight className="size-3" />
            <span>{scene.venues?.name}</span>
            <ChevronRight className="size-3" />
            <Link href={`/venues/scenes/${scene.id}`} className="hover:text-foreground">
              {scene.name}
            </Link>
          </nav>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-base font-medium text-muted-foreground">{task.code}</span>
            <StatusBadge status={task.status} className="text-sm" />
            {task.archived && <Badge variant="outline">Archived</Badge>}
            {task.current_version > 1 && (
              <Badge variant="secondary">
                <History /> v{task.current_version}
              </Badge>
            )}
          </span>
        }
        actions={
          <TaskWorkflow
            taskId={task.id}
            code={task.code}
            status={task.status}
            archived={task.archived}
            canEdit={staff}
            canRecordFeasibility={canRecordFeasibility}
          />
        }
      />

      <p className="mb-6 max-w-4xl text-xl leading-snug font-medium text-balance sm:text-2xl">{task.instruction}</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Link
            href={`/venues/scenes/${scene.id}`}
            className="block overflow-hidden rounded-xl border bg-muted"
            aria-label={`Open scene ${scene.name}`}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={photoUrl} alt={`Scene: ${scene.name}`} className="aspect-[16/10] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center text-sm text-muted-foreground">
                <ImageOff className="mr-2 size-4" /> No scene photo yet
              </div>
            )}
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            <PropsCard title="At the scene" icon={Package} props={atScene} />
            <PropsCard title="To buy" icon={ShoppingCart} props={toBuy} showAcquired />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Robot constraints</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Fact icon={Hand} label="Arms" value={task.arms_required === 2 ? "Two arms" : "One arm"} />
              <Fact icon={Dumbbell} label="Max prop weight" value={task.max_prop_weight_g ? `${task.max_prop_weight_g} g` : "—"} />
              <Fact icon={Gauge} label="Difficulty" value={task.difficulty ? `${task.difficulty} / 5` : "—"} />
              <Fact icon={ChevronRight} label="Priority" value={["High", "Normal", "Low"][task.priority - 1]} />
            </CardContent>
          </Card>

          {(task.feasibility_notes || task.notes || scene.clearance_notes) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {task.feasibility_notes && <Note label="Feasibility" text={task.feasibility_notes} />}
                {task.notes && <Note label="Task notes" text={task.notes} />}
                {scene.clearance_notes && <Note label="Scene clearance" text={scene.clearance_notes} />}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular">{task.success_count}</span>
                <span className="text-muted-foreground">/ {task.target_episodes} successful episodes</span>
              </div>
              <TaskProgress success={task.success_count} target={task.target_episodes} showLabel={false} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/60 p-3">
                  <div className="text-muted-foreground">Episodes</div>
                  <div className="text-lg font-semibold tabular">{task.episode_count}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <div className="text-muted-foreground">Success rate</div>
                  <div className="text-lg font-semibold tabular">{successRate === null ? "—" : `${successRate}%`}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-muted-foreground" /> Version history
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l pl-5">
                {versions.map((v, i) => {
                  const prev = versions[i + 1];
                  return (
                    <li key={v.version} className="relative">
                      <span
                        className={cn(
                          "absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-card",
                          i === 0 ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">v{v.version}</span>
                        <span title={format(new Date(v.created_at), "PPpp")}>
                          {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                        </span>
                        {v.profiles && <span>· {v.profiles.full_name ?? v.profiles.email}</span>}
                      </div>
                      <p className="mt-1 text-sm">
                        {prev
                          ? diffWords(prev.instruction, v.instruction).map((part, k) => (
                              <span
                                key={k}
                                className={cn(
                                  part.type === "added" && "rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                                  part.type === "removed" && "rounded bg-rose-500/10 text-rose-700 line-through dark:text-rose-300",
                                )}
                              >
                                {part.text}
                              </span>
                            )).reduce<React.ReactNode[]>((acc, el, k) => (k ? [...acc, " ", el] : [el]), [])
                          : v.instruction}
                      </p>
                      {v.change_reason && (
                        <p className="mt-1 text-xs text-muted-foreground italic">“{v.change_reason}”</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent episodes</CardTitle>
            </CardHeader>
            <CardContent>
              {!episodes?.length ? (
                <p className="text-sm text-muted-foreground">No episodes recorded yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {episodes.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      {e.outcome === "success" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Success" />
                      ) : e.outcome === "failure" ? (
                        <XCircle className="size-4 shrink-0 text-destructive" aria-label="Failure" />
                      ) : (
                        <CircleSlash className="size-4 shrink-0 text-muted-foreground" aria-label="Aborted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {e.outcome === "success" ? "Success" : (e.failure_reason ?? e.outcome)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {e.sessions?.profiles?.full_name ?? "Unknown"} · {e.sessions?.rigs?.name ?? "No rig"} · v
                          {e.task_version}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground tabular">
                        {e.duration_s !== null && <div>{Number(e.duration_s).toFixed(0)} s</div>}
                        <div>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function PropsCard({
  title,
  icon: Icon,
  props,
  showAcquired,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  props: { qty: number; acquired: boolean; props: { name: string } | null }[];
  showAcquired?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {props.length === 0 ? (
          <p className="text-sm text-muted-foreground">None</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {props.map((p) => (
              <Badge
                key={p.props?.name}
                variant={showAcquired ? (p.acquired ? "secondary" : "outline") : "secondary"}
                className={cn("font-normal", showAcquired && !p.acquired && "border-amber-500/40 text-amber-800 dark:text-amber-300")}
              >
                {p.qty > 1 && <span className="tabular">{p.qty}×</span>}
                {p.props?.name}
                {showAcquired && p.acquired && <CheckCircle2 className="text-success" />}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </div>
  );
}
