"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Hand, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/tasks/status-badge";
import { TaskProgress } from "@/components/tasks/task-progress";
import { STATUS_META, STATUS_ORDER, type TaskStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { bulkSetStatus } from "./actions";

export type TaskRow = {
  id: string;
  code: string;
  instruction: string;
  status: TaskStatus;
  arms_required: number;
  success_count: number;
  target_episodes: number;
  tags: string[];
  scene: string;
  venue: string;
};

export function TaskTable({ rows, canBulkEdit }: { rows: TaskRow[]; canBulkEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function applyStatus(status: string) {
    const ids = [...selected];
    startTransition(async () => {
      const res = await bulkSetStatus(ids, status);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data} task${res.data === 1 ? "" : "s"} moved to ${STATUS_META[status as TaskStatus].label}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="relative">
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {canBulkEdit && (
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected ? true : selected.size ? "indeterminate" : false}
                    onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
              )}
              <SortHeader label="Code" field="code" className="w-24" />
              <th className="px-3 py-2.5 font-medium">Instruction</th>
              <SortHeader label="Status" field="status" className="w-36" />
              <SortHeader label="Progress" field="progress" className="w-48" />
              <th className="w-16 px-3 py-2.5 text-center font-medium">Arms</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn("group transition-colors hover:bg-muted/40", selected.has(r.id) && "bg-primary/5")}
              >
                {canBulkEdit && (
                  <td className="px-3 py-3">
                    <Checkbox aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                )}
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  <Link href={`/tasks/${r.code}`} className="hover:text-foreground">
                    {r.code}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <Link href={`/tasks/${r.code}`} className="block">
                    <div className="line-clamp-2 font-medium group-hover:text-primary">{r.instruction}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {r.venue} · {r.scene}
                      </span>
                      {r.tags.map((t) => (
                        <span key={t} className="text-muted-foreground/80">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-3">
                  <TaskProgress success={r.success_count} target={r.target_episodes} />
                </td>
                <td className="px-3 py-3 text-center">
                  <ArmsBadge arms={r.arms_required} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start gap-3">
              {canBulkEdit && (
                <Checkbox
                  className="mt-0.5"
                  aria-label={`Select ${r.code}`}
                  checked={selected.has(r.id)}
                  onCheckedChange={() => toggle(r.id)}
                />
              )}
              <Link href={`/tasks/${r.code}`} className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-sm font-medium">{r.instruction}</div>
                <div className="text-xs text-muted-foreground">
                  {r.venue} · {r.scene}
                </div>
                <div className="flex items-center gap-3">
                  <TaskProgress success={r.success_count} target={r.target_episodes} className="flex-1" />
                  <ArmsBadge arms={r.arms_required} />
                </div>
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {canBulkEdit && selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-lg items-center gap-2 rounded-xl border bg-popover p-2 pl-4 shadow-lg lg:bottom-6">
          <span className="text-sm font-medium tabular">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Select onValueChange={applyStatus} disabled={pending}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArmsBadge({ arms }: { arms: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
      title={`${arms} arm${arms === 1 ? "" : "s"}`}
    >
      <Hand className="size-3.5" />
      {arms === 2 && <Hand className="-ml-1.5 size-3.5 -scale-x-100" />}
      <span className="sr-only">{arms} arms</span>
    </span>
  );
}

function SortHeader({ label, field, className }: { label: string; field: string; className?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const sort = params.get("sort") ?? "code";
  const active = sort === field || sort === `-${field}`;
  const desc = sort === `-${field}`;
  const next = new URLSearchParams(params);
  const value = active && !desc && field !== "status" ? `-${field}` : field;
  next.set("sort", value);
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <th className={cn("px-3 py-2.5 font-medium", className)} aria-sort={active ? (desc ? "descending" : "ascending") : undefined}>
      <Link href={`${pathname}?${next.toString()}`} scroll={false} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </Link>
    </th>
  );
}
