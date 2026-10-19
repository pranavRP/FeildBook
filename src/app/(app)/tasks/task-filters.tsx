"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";

const ALL = "__all";

export function TaskFilters({
  venues,
  scenes,
  tags,
}: {
  venues: { id: string; name: string }[];
  scenes: { id: string; name: string; venue_id: string }[];
  tags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const statuses = (params.get("status") ?? "").split(",").filter(Boolean);
  const venue = params.get("venue") ?? "";

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Debounced text search.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const visibleScenes = venue ? scenes.filter((s) => s.venue_id === venue) : scenes;
  const active = ["q", "venue", "scene", "status", "arms", "tag", "archived"].some((k) => params.get(k));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by instruction or code"
          className="h-9 pl-8"
          aria-label="Filter tasks"
        />
        {pending && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      <Select value={venue || ALL} onValueChange={(v) => update({ venue: v === ALL ? null : v, scene: null })}>
        <SelectTrigger className="h-9 w-[calc(50%-4px)] sm:w-40" aria-label="Venue">
          <SelectValue placeholder="Venue" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All venues</SelectItem>
          {venues.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get("scene") ?? ALL} onValueChange={(v) => update({ scene: v === ALL ? null : v })}>
        <SelectTrigger className="h-9 w-[calc(50%-4px)] sm:w-52" aria-label="Scene">
          <SelectValue placeholder="Scene" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All scenes</SelectItem>
          {visibleScenes.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("h-9 justify-between", statuses.length && "border-primary/50")}>
            {statuses.length ? `Status · ${statuses.length}` : "Status"}
            <ChevronDown className="size-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          {STATUS_ORDER.map((s) => {
            const checked = statuses.includes(s);
            return (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c ? [...statuses, s] : statuses.filter((x) => x !== s);
                    update({ status: next.join(",") || null });
                  }}
                />
                <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </label>
            );
          })}
        </PopoverContent>
      </Popover>

      <Select value={params.get("arms") ?? ALL} onValueChange={(v) => update({ arms: v === ALL ? null : v })}>
        <SelectTrigger className="h-9 w-[calc(50%-4px)] sm:w-32" aria-label="Arms">
          <SelectValue placeholder="Arms" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any arms</SelectItem>
          <SelectItem value="1">1 arm</SelectItem>
          <SelectItem value="2">2 arms</SelectItem>
        </SelectContent>
      </Select>

      {tags.length > 0 && (
        <Select value={params.get("tag") ?? ALL} onValueChange={(v) => update({ tag: v === ALL ? null : v })}>
          <SelectTrigger className="h-9 w-[calc(50%-4px)] sm:w-32" aria-label="Tag">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any tag</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                #{t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {active && (
        <Button
          variant="ghost"
          className="h-9"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
