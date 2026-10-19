"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type Kind = "reference" | "layout" | "reset" | "other";
type Item = { id: string; file: File; preview: string; state: "queued" | "uploading" | "done" | "error"; error?: string };

const MAX_EDGE = 2400;

/** Downscales and re-encodes to JPEG in the browser (also converts HEIC on Safari). */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // the server validates and re-encodes anyway
  }
}

export function PhotoUploader({ sceneId, sceneName }: { sceneId: string; sceneName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState<Kind>("reference");
  const [caption, setCaption] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  function add(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (images.length < [...files].length) toast.warning("Only image files can be uploaded.");
    setItems((prev) => [
      ...prev,
      ...images.slice(0, 10 - prev.length).map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        state: "queued" as const,
      })),
    ]);
  }

  function reset() {
    items.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
    setCaption("");
  }

  async function uploadAll() {
    setBusy(true);
    let ok = 0;
    const failed = new Set<string>();
    for (const item of items.filter((i) => i.state !== "done")) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: "uploading" } : i)));
      const body = new FormData();
      body.set("scene_id", sceneId);
      body.set("kind", kind);
      if (caption.trim()) body.set("caption", caption.trim());
      const blob = await compress(item.file);
      body.append("files", blob, item.file.name.replace(/\.\w+$/, "") + ".jpg");
      let error: string | undefined;
      try {
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = (await res.json()) as { created?: string[]; errors?: { error: string }[]; error?: string };
        if (!res.ok) error = json.error ?? json.errors?.[0]?.error ?? "Upload failed";
      } catch {
        error = "Network error";
      }
      if (error) failed.add(item.id);
      else ok++;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: error ? "error" : "done", error } : i)));
    }
    setBusy(false);
    if (ok) {
      toast.success(`${ok} photo${ok === 1 ? "" : "s"} uploaded`);
      router.refresh();
    }
    if (failed.size) {
      setItems((prev) => prev.filter((i) => failed.has(i.id)));
    } else {
      reset();
      setOpen(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ImagePlus /> Add photos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add photos</DialogTitle>
          <DialogDescription>
            To {sceneName}. Location data and other metadata are removed on upload.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <Upload className="size-6 text-muted-foreground" />
          <p className="hidden text-sm text-muted-foreground sm:block">Drag photos here, or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" className="sm:hidden" onClick={() => cameraInput.current?.click()}>
              <Camera /> Take photo
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <ImagePlus /> Choose files
            </Button>
          </div>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => e.target.files && add(e.target.files)}
            data-testid="camera-input"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = "";
            }}
            data-testid="file-input"
          />
        </div>

        {items.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={item.preview} alt="" className="size-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {item.state === "uploading" && <Loader2 className="size-6 animate-spin text-white drop-shadow" />}
                  {item.state === "done" && <CheckCircle2 className="size-6 text-white drop-shadow" />}
                </div>
                {item.state === "error" && (
                  <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-1 py-0.5 text-[10px] text-white">
                    {item.error}
                  </div>
                )}
                {item.state === "queued" && !busy && (
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Label>Photo type</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as Kind)}
            className="w-full"
          >
            {(["reference", "layout", "reset", "other"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1 capitalize">
                {k}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label htmlFor="caption">Caption (optional)</Label>
          <Input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} />
        </div>

        <DialogFooter>
          <Button onClick={uploadAll} disabled={busy || !items.some((i) => i.state !== "done")}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload {items.length || ""} photo{items.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
