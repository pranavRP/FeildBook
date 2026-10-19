"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TaskStatus } from "@/lib/status";
import { createTask, findSimilarTasks, updateTask } from "./actions";

type PropRow = { name: string; qty: number; source: "at_scene" | "to_buy"; acquired: boolean };
export type TaskFormValues = {
  scene_id: string;
  instruction: string;
  priority: number;
  arms_required: number;
  max_prop_weight_g: number | null;
  difficulty: number | null;
  target_episodes: number;
  feasibility_notes: string | null;
  notes: string | null;
  tags: string[];
  props: PropRow[];
};
type Similar = { id: string; code: string; instruction: string; status: TaskStatus; similarity: number };

export function TaskForm({
  task,
  scenes,
  propNames,
  defaultSceneId,
}: {
  task?: { id: string; code: string } & TaskFormValues;
  scenes: { id: string; name: string; venue: string }[];
  propNames: string[];
  defaultSceneId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<TaskFormValues>(
    task ?? {
      scene_id: defaultSceneId ?? "",
      instruction: "",
      priority: 2,
      arms_required: 1,
      max_prop_weight_g: null,
      difficulty: null,
      target_episodes: 50,
      feasibility_notes: null,
      notes: null,
      tags: [],
      props: [],
    },
  );
  const [changeReason, setChangeReason] = useState("");
  const [publish, setPublish] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [checking, setChecking] = useState(false);

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const instructionChanged = !!task && task.instruction.trim() !== values.instruction.trim();

  // Duplicate warning (debounced).
  useEffect(() => {
    const text = values.instruction.trim();
    if (text.length < 8 || (task && !instructionChanged)) return setSimilar([]);
    setChecking(true);
    const t = setTimeout(async () => {
      setSimilar((await findSimilarTasks(text, task?.id)) as Similar[]);
      setChecking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [values.instruction, task, instructionChanged]);

  const byVenue = useMemo(() => {
    const groups = new Map<string, typeof scenes>();
    for (const s of scenes) groups.set(s.venue, [...(groups.get(s.venue) ?? []), s]);
    return [...groups.entries()];
  }, [scenes]);

  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (tag && !values.tags.includes(tag)) set("tags", [...values.tags, tag]);
    setTagInput("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...values,
      change_reason: instructionChanged ? changeReason : null,
      status: publish ? "ready" : "proposed",
    };
    startTransition(async () => {
      const res = task ? await updateTask(task.id, payload) : await createTask(payload);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        task
          ? instructionChanged
            ? "Saved as a new version"
            : "Task saved"
          : `Created ${res.data}${publish ? " · now visible in the operator tool" : ""}`,
      );
      router.push(`/tasks/${res.data}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task</CardTitle>
            <CardDescription>One clear, physical instruction an operator can repeat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Scene</Label>
              <Select value={values.scene_id} onValueChange={(v) => set("scene_id", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a scene" />
                </SelectTrigger>
                <SelectContent>
                  {byVenue.map(([venue, list]) => (
                    <SelectGroup key={venue}>
                      <SelectLabel>{venue}</SelectLabel>
                      {list.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instruction">Instruction</Label>
              <Textarea
                id="instruction"
                value={values.instruction}
                onChange={(e) => set("instruction", e.target.value)}
                rows={3}
                required
                minLength={5}
                maxLength={1000}
                placeholder="Put the loose stirrers back into the red cup, all upright"
                className="text-base"
              />
              {checking && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Checking for similar tasks…
                </p>
              )}
            </div>
            {similar.length > 0 && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <TriangleAlert className="text-amber-600" />
                <AlertTitle>Possible duplicate</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 w-full space-y-1.5">
                    {similar.map((s) => (
                      <li key={s.id} className="flex items-start gap-2">
                        <Link href={`/tasks/${s.code}`} target="_blank" className="font-mono text-xs underline">
                          {s.code}
                        </Link>
                        <span className="flex-1 text-foreground">{s.instruction}</span>
                        <span className="text-xs tabular">{Math.round(s.similarity * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {instructionChanged && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor="reason">Why did the instruction change?</Label>
                <Input
                  id="reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  required
                  placeholder="e.g. robot couldn't reach the drawer"
                />
                <p className="text-xs text-muted-foreground">
                  Saving creates a new version. The old instruction and this reason stay in the history.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <PropsEditor props={values.props} onChange={(p) => set("props", p)} propNames={propNames} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feas">Feasibility notes</Label>
              <Textarea
                id="feas"
                rows={2}
                value={values.feasibility_notes ?? ""}
                onChange={(e) => set("feasibility_notes", e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={values.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Robot constraints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Arms required</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(values.arms_required)}
                onValueChange={(v) => v && set("arms_required", Number(v))}
                className="w-full"
              >
                <ToggleGroupItem value="1" className="flex-1">
                  One arm
                </ToggleGroupItem>
                <ToggleGroupItem value="2" className="flex-1">
                  Two arms
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={values.difficulty ? String(values.difficulty) : ""}
                onValueChange={(v) => set("difficulty", v ? Number(v) : null)}
                className="w-full"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <ToggleGroupItem key={d} value={String(d)} className="flex-1">
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="weight">Max prop weight (g)</Label>
                <Input
                  id="weight"
                  type="number"
                  min={1}
                  value={values.max_prop_weight_g ?? ""}
                  onChange={(e) => set("max_prop_weight_g", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Target episodes</Label>
                <Input
                  id="target"
                  type="number"
                  min={1}
                  required
                  value={values.target_episodes}
                  onChange={(e) => set("target_episodes", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={String(values.priority)} onValueChange={(v) => set("priority", Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High</SelectItem>
                  <SelectItem value="2">Normal</SelectItem>
                  <SelectItem value="3">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="kitchen, cables…"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {values.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {values.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      #{t}
                      <button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", values.tags.filter((x) => x !== t))}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!task && (
          <label className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <span>
              <span className="font-medium">Ready for operators</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Publish now: the task appears in the operator tool as soon as you save. Leave off to keep it as a
                proposal and mark it Ready later.
              </span>
            </span>
            <Switch checked={publish} onCheckedChange={setPublish} aria-label="Ready for operators" />
          </label>
        )}

        <div className="flex gap-2 lg:sticky lg:top-20">
          <Button type="submit" className="flex-1" disabled={pending || !values.scene_id}>
            {pending && <Loader2 className="animate-spin" />}
            {task ? "Save changes" : "Create task"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

function PropsEditor({
  props,
  onChange,
  propNames,
}: {
  props: PropRow[];
  onChange: (p: PropRow[]) => void;
  propNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const taken = new Set(props.map((p) => p.name.toLowerCase()));
  const exact = propNames.some((n) => n.toLowerCase() === query.trim().toLowerCase());

  function add(name: string) {
    const clean = name.trim();
    if (!clean || taken.has(clean.toLowerCase())) return;
    onChange([...props, { name: clean, qty: 1, source: "at_scene", acquired: false }]);
    setQuery("");
    setOpen(false);
  }
  const update = (i: number, patch: Partial<PropRow>) => onChange(props.map((p, j) => (i === j ? { ...p, ...patch } : p)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Props</CardTitle>
        <CardDescription>What&apos;s already at the scene, and what has to be bought.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.map((p, i) => (
          <div key={p.name} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="min-w-32 flex-1 text-sm font-medium">{p.name}</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={p.qty}
              onChange={(e) => update(i, { qty: Math.max(1, Number(e.target.value)) })}
              className="h-8 w-16"
              aria-label={`Quantity of ${p.name}`}
            />
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={p.source}
              onValueChange={(v) => v && update(i, { source: v as PropRow["source"], acquired: v === "to_buy" ? p.acquired : false })}
            >
              <ToggleGroupItem value="at_scene">At scene</ToggleGroupItem>
              <ToggleGroupItem value="to_buy">To buy</ToggleGroupItem>
            </ToggleGroup>
            {p.source === "to_buy" && (
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={p.acquired} onCheckedChange={(c) => update(i, { acquired: c === true })} />
                Bought
              </label>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${p.name}`}
              onClick={() => onChange(props.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-start text-muted-foreground">
              <Plus /> Add a prop
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search or create a prop…" value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandEmpty>No matching props.</CommandEmpty>
                {query.trim() && !exact && (
                  <CommandGroup>
                    <CommandItem value={`create ${query}`} onSelect={() => add(query)}>
                      <Plus /> Create “{query.trim()}”
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading="Existing props">
                  {propNames
                    .filter((n) => !taken.has(n.toLowerCase()))
                    .map((n) => (
                      <CommandItem key={n} value={n} onSelect={() => add(n)}>
                        <Check className="opacity-0" /> {n}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}
