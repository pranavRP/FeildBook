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
import { saveVenue } from "./actions";

type Venue = { id: string; name: string; address: string | null; notes: string | null; drive_folder_url: string | null };

export function VenueDialog({ venue, trigger }: { venue?: Venue; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    startTransition(async () => {
      const res = await saveVenue(venue?.id ?? null, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(venue ? "Venue updated" : "Venue created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{venue ? "Edit venue" : "New venue"}</DialogTitle>
            <DialogDescription>Venues group the scenes where data is collected.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="v-name">Name</Label>
            <Input id="v-name" name="name" required defaultValue={venue?.name} placeholder="Office Site A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-address">Address</Label>
            <Input id="v-address" name="address" defaultValue={venue?.address ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-drive">Photo folder URL</Label>
            <Input id="v-drive" name="drive_folder_url" type="url" defaultValue={venue?.drive_folder_url ?? ""} placeholder="https://" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea id="v-notes" name="notes" defaultValue={venue?.notes ?? ""} rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {venue ? "Save" : "Create venue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
