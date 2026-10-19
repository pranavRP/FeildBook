"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Archive, ArchiveRestore, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEASIBILITY_RESULTS, STATUS_META, TRANSITIONS, type TaskStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { recordFeasibility, setTaskArchived, setTaskStatus } from "../actions";

export function TaskWorkflow({
  taskId,
  code,
  status,
  archived,
  canEdit,
  canRecordFeasibility,
}: {
  taskId: string;
  code: string;
  status: TaskStatus;
  archived: boolean;
  canEdit: boolean;
  canRecordFeasibility: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feasibility, setFeasibility] = useState<TaskStatus | null>(null);
  const [notes, setNotes] = useState("");

  const next = canEdit ? TRANSITIONS[status] : canRecordFeasibility && status === "feasibility_test" ? FEASIBILITY_RESULTS : [];

  function move(to: TaskStatus) {
    // Feasibility results ask for notes first.
    if (FEASIBILITY_RESULTS.includes(to) && status === "feasibility_test") {
      setNotes("");
      return setFeasibility(to);
    }
    startTransition(async () => {
      const res = await setTaskStatus(taskId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Moved to ${STATUS_META[to].label}`);
      router.refresh();
    });
  }

  function submitFeasibility() {
    if (!feasibility) return;
    startTransition(async () => {
      const res = await recordFeasibility(taskId, feasibility, notes.trim() || null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Feasibility recorded: ${STATUS_META[feasibility].label}`);
      setFeasibility(null);
      router.refresh();
    });
  }

  function toggleArchive() {
    startTransition(async () => {
      const res = await setTaskArchived(taskId, !archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(archived ? "Task restored" : "Task archived");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next.map((to) => (
        <Button
          key={to}
          variant={to === "infeasible" || to === "needs_change" ? "outline" : "secondary"}
          disabled={pending || archived}
          onClick={() => move(to)}
          className="gap-1.5"
        >
          <span className={cn("size-2 rounded-full", STATUS_META[to].dot)} />
          {status === "feasibility_test" ? STATUS_META[to].label : <>Move to {STATUS_META[to].label}</>}
          {to !== "infeasible" && to !== "needs_change" && <ArrowRight className="size-3.5 opacity-60" />}
        </Button>
      ))}
      {canEdit && status === "needs_change" && (
        <Button asChild variant="secondary">
          <Link href={`/tasks/${code}/edit`}>
            <Pencil /> Revise instruction
          </Link>
        </Button>
      )}
      {canEdit && (
        <>
          <Button asChild variant="outline">
            <Link href={`/tasks/${code}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleArchive} disabled={pending} aria-label={archived ? "Restore task" : "Archive task"}>
            {archived ? <ArchiveRestore /> : <Archive />}
          </Button>
        </>
      )}

      <Dialog open={feasibility !== null} onOpenChange={(o) => !o && setFeasibility(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as {feasibility && STATUS_META[feasibility].label.toLowerCase()}</DialogTitle>
            <DialogDescription>What did the feasibility test show? Notes help the next designer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="f-notes">Notes</Label>
            <Textarea
              id="f-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. arm can't clear the top shelf; works if the bin is on the table"
            />
          </div>
          <DialogFooter>
            <Button onClick={submitFeasibility} disabled={pending}>
              Record result
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
