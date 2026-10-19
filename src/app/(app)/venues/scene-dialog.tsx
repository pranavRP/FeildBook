"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveScene } from "./actions";

type Scene = {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  surface_height_in: number | null;
  clearance_notes: string | null;
  reset_instructions: string | null;
};

export function SceneDialog({
  scene,
  venues,
  defaultVenueId,
  trigger,
}: {
  scene?: Scene;
  venues: { id: string; name: string }[];
  defaultVenueId?: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState(scene?.venue_id ?? defaultVenueId ?? venues[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = { ...Object.fromEntries(new FormData(e.currentTarget)), venue_id: venueId };
    startTransition(async () => {
      const res = await saveScene(scene?.id ?? null, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(scene ? "Scene updated" : "Scene created");
      setOpen(false);
      if (scene) router.refresh();
      else router.push(`/venues/scenes/${res.data}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{scene ? "Edit scene" : "New scene"}</DialogTitle>
            <DialogDescription>A physical setup at a venue where tasks are recorded.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" name="name" required defaultValue={scene?.name} placeholder="Storage room metal shelving 01" />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a venue" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-height">Surface height (in)</Label>
              <Input
                id="s-height"
                name="surface_height_in"
                type="number"
                step="0.5"
                min={0}
                defaultValue={scene?.surface_height_in ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea id="s-desc" name="description" rows={3} defaultValue={scene?.description ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-clear">Clearance notes</Label>
            <Textarea id="s-clear" name="clearance_notes" rows={2} defaultValue={scene?.clearance_notes ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-reset">Reset instructions</Label>
            <Textarea id="s-reset" name="reset_instructions" rows={3} defaultValue={scene?.reset_instructions ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !venueId}>
              {scene ? "Save" : "Create scene"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
