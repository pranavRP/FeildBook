"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImageOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { deletePhoto, updatePhoto } from "@/app/(app)/venues/actions";
import type { SignedPhoto } from "@/lib/signed-urls";
import { cn } from "@/lib/utils";

const KINDS = ["reference", "layout", "reset", "other"] as const;

export function PhotoGallery({
  photos,
  canEdit,
  scenes,
}: {
  photos: SignedPhoto[];
  canEdit: boolean;
  /** Other scenes a photo can be moved to (used for the "Unsorted" inbox). */
  scenes?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [index, setIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const touchX = useRef<number | null>(null);

  const visible = filter === "all" ? photos : photos.filter((p) => p.kind === filter);
  const current = index !== null ? visible[index] : null;
  const counts = Object.fromEntries(KINDS.map((k) => [k, photos.filter((p) => p.kind === k).length]));

  const step = (d: number) => setIndex((i) => (i === null ? i : (i + d + visible.length) % visible.length));

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, visible.length]);

  function save(values: { kind?: string; caption?: string | null; scene_id?: string }) {
    if (!current) return;
    startTransition(async () => {
      const res = await updatePhoto({ id: current.id, kind: current.kind, caption: current.caption, ...values });
      if (!res.ok) return void toast.error(res.error);
      toast.success(values.scene_id ? "Photo moved" : "Photo updated");
      if (values.scene_id) setIndex(null);
      router.refresh();
    });
  }

  function remove() {
    if (!current || !confirm("Delete this photo?")) return;
    startTransition(async () => {
      const res = await deletePhoto(current.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Photo deleted");
      setIndex(null);
      router.refresh();
    });
  }

  if (!photos.length) {
    return (
      <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
        <ImageOff className="size-6" />
        No photos yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v);
          setIndex(null);
        }}
        className="flex-wrap"
      >
        <ToggleGroupItem value="all">All {photos.length}</ToggleGroupItem>
        {KINDS.filter((k) => counts[k]).map((k) => (
          <ToggleGroupItem key={k} value={k} className="capitalize">
            {k} {counts[k]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              "group relative overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              i === 0 && filter === "all" && "col-span-2 row-span-2",
            )}
            aria-label={p.caption ?? `Open ${p.kind} photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img
              src={i === 0 && filter === "all" ? p.url : p.thumbUrl}
              alt={p.caption ?? ""}
              className="aspect-[4/3] size-full object-cover transition duration-300 group-hover:scale-[1.03]"
              loading={i < 3 ? "eager" : "lazy"}
            />
            <Badge variant="secondary" className="absolute bottom-2 left-2 bg-background/85 capitalize backdrop-blur">
              {p.kind}
            </Badge>
          </button>
        ))}
      </div>

      <Dialog open={current !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="max-w-[min(96vw,1200px)] gap-3 p-3 sm:max-w-[min(96vw,1200px)]">
          <DialogTitle className="sr-only">Photo {index !== null ? index + 1 : ""}</DialogTitle>
          <DialogDescription className="sr-only">Scene photo viewer</DialogDescription>
          {current && (
            <>
              <div
                className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black"
                onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (touchX.current === null) return;
                  const dx = e.changedTouches[0].clientX - touchX.current;
                  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
                  touchX.current = null;
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={current.url} alt={current.caption ?? ""} className="max-h-[72dvh] w-auto object-contain" />
                {visible.length > 1 && (
                  <>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute left-2 rounded-full opacity-80"
                      onClick={() => step(-1)}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 rounded-full opacity-80"
                      onClick={() => step(1)}
                      aria-label="Next photo"
                    >
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
                <span className="text-muted-foreground tabular">
                  {index! + 1} / {visible.length}
                </span>
                {canEdit ? (
                  <>
                    <Select value={current.kind} onValueChange={(kind) => save({ kind })} disabled={pending}>
                      <SelectTrigger size="sm" className="w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k} value={k} className="capitalize">
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      key={current.id}
                      defaultValue={current.caption ?? ""}
                      placeholder="Add a caption"
                      className="h-8 min-w-40 flex-1"
                      onBlur={(e) => e.target.value !== (current.caption ?? "") && save({ caption: e.target.value })}
                    />
                    {scenes && scenes.length > 0 && (
                      <Select onValueChange={(scene_id) => save({ scene_id })} disabled={pending}>
                        <SelectTrigger size="sm" className="w-44">
                          <SelectValue placeholder="Move to scene…" />
                        </SelectTrigger>
                        <SelectContent>
                          {scenes.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={remove} disabled={pending} aria-label="Delete photo">
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="capitalize">
                      {current.kind}
                    </Badge>
                    {current.caption && <span>{current.caption}</span>}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
