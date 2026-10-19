"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, CircleSlash, History, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { TaskProgress } from "@/components/tasks/task-progress";
import { refreshDashboard } from "@/app/(app)/dashboard-action";
import type { DashboardData } from "@/lib/dashboard";
import { STATUS_META, type TaskStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";
import { EpisodesChart } from "./episodes-chart";
import { LiveBadge, useLiveEpisodes } from "./live-refresh";

const FUNNEL: TaskStatus[] = ["proposed", "feasibility_test", "feasible", "ready", "collecting", "done"];

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

export function DashboardView({
  initial,
  title,
  description,
  children,
}: {
  initial: DashboardData;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const [data, setData] = useState(initial);
  const live = useLiveEpisodes(async () => {
    const fresh = await refreshDashboard();
    if (fresh) setData(fresh);
  });
  const funnelMax = Math.max(1, ...FUNNEL.map((s) => data.byStatus[s]));

  return (
    <>
      <PageHeader title={title} description={description} actions={<LiveBadge {...live} />} />
      {children}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((k) => {
          const body = (
            <>
              <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                <AnimatedNumber value={k.value} suffix={k.suffix} />
              </div>
            </>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} prefetch={false} className="rounded-xl border bg-card p-4 transition hover:shadow-md" data-testid={`kpi-${k.label}`}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className="rounded-xl border bg-card p-4" data-testid={`kpi-${k.label}`}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Episodes per day</CardTitle>
            <CardDescription>
              Last 14 days · {data.totals.episodes.toLocaleString()} episodes, {data.totals.successes.toLocaleString()} successful
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EpisodesChart data={data.days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task pipeline</CardTitle>
            <CardDescription>
              {data.byStatus.needs_change} need changes · {data.byStatus.infeasible} infeasible
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {FUNNEL.map((s) => (
              <Link key={s} href={`/tasks?status=${s}`} prefetch={false} className="group block">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground group-hover:text-foreground">{STATUS_META[s].label}</span>
                  <span className="font-medium tabular">{data.byStatus[s]}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-500", STATUS_META[s].dot)}
                    style={{ width: `${(data.byStatus[s] / funnelMax) * 100}%` }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress by venue</CardTitle>
            <CardDescription>Successful episodes vs. targets for ready, collecting and done tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.venues.map((v) => (
              <div key={v.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    {Math.round((v.success / v.target) * 100)}% · {v.tasks} tasks
                  </span>
                </div>
                <TaskProgress success={v.success} target={v.target} />
              </div>
            ))}
            {data.venues.length === 0 && <p className="text-sm text-muted-foreground">Nothing is collecting yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closest to target</CardTitle>
            <CardDescription>Collecting tasks with the fewest episodes to go</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.closest.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.code}`} prefetch={false} className="group block">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
                      <span className="truncate group-hover:text-primary">{t.instruction}</span>
                    </div>
                    <TaskProgress success={t.success_count} target={t.target_episodes} className="mt-1" />
                  </Link>
                </li>
              ))}
              {data.closest.length === 0 && <p className="text-sm text-muted-foreground">No tasks are collecting.</p>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5" data-testid="activity-feed">
              {data.activity.map((a) => (
                <li key={a.key} className="flex gap-3">
                  {a.kind === "version" ? (
                    <History className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  ) : a.outcome === "success" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-series-1" aria-hidden />
                  ) : a.outcome === "failure" ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-series-2" aria-hidden />
                  ) : (
                    <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{a.who}</span>{" "}
                    <span className="text-muted-foreground">
                      {a.kind === "version"
                        ? "revised"
                        : `logged ${a.outcome === "success" ? "a success" : a.outcome === "failure" ? `a failure (${a.reason})` : "an abort"} on`}
                    </span>{" "}
                    <Link href={`/tasks/${a.code}`} prefetch={false} className="font-mono text-xs hover:underline">
                      {a.code}
                    </Link>
                    {a.kind === "version" && <span className="text-muted-foreground"> to v{a.version}</span>}
                    <div className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                      {a.kind === "version" ? `${a.reason ?? "Revised"} · ${ago(a.at)}` : `${a.rig} · ${ago(a.at)}`}
                    </div>
                  </div>
                </li>
              ))}
              {data.activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
