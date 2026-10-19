"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createApiKey, revokeApiKey, saveRig } from "../actions";

type Rig = { id: string; name: string; arm_model: string | null; headset: string | null; arms: number; active: boolean; notes: string | null };

export function RigDialog({ rig, trigger }: { rig?: Rig; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [arms, setArms] = useState(String(rig?.arms ?? 1));
  const [active, setActive] = useState(rig?.active ?? true);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = {
      name: f.get("name"),
      arm_model: f.get("arm_model") || null,
      headset: f.get("headset") || null,
      notes: f.get("notes") || null,
      arms,
      active,
    };
    startTransition(async () => {
      const res = await saveRig(rig?.id ?? null, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(rig ? "Rig updated" : "Rig created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{rig ? "Edit rig" : "New rig"}</DialogTitle>
            <DialogDescription>A recording station: arm(s), headset and the PC that calls the API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" name="name" required defaultValue={rig?.name} placeholder="Rig D" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r-arm">Arm model</Label>
              <Input id="r-arm" name="arm_model" defaultValue={rig?.arm_model ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-headset">Headset</Label>
              <Input id="r-headset" name="headset" defaultValue={rig?.headset ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Arms</Label>
            <ToggleGroup type="single" variant="outline" value={arms} onValueChange={(v) => v && setArms(v)}>
              <ToggleGroupItem value="1">One arm</ToggleGroupItem>
              <ToggleGroupItem value="2">Two arms</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-notes">Notes</Label>
            <Input id="r-notes" name="notes" defaultValue={rig?.notes ?? ""} />
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            Active <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {rig ? "Save" : "Create rig"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewKeyDialog({ rigId, rigName }: { rigId: string; rigName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const res = await createApiKey(rigId, label || null);
      if (!res.ok) return void toast.error(res.error);
      setKey(res.data);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setKey(null);
          setLabel("");
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound /> New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API key for {rigName}</DialogTitle>
          <DialogDescription>Put it on the recording PC as FIELDBOOK_API_KEY.</DialogDescription>
        </DialogHeader>
        {key ? (
          <div className="space-y-3">
            <Alert className="border-amber-500/40 bg-amber-500/5">
              <TriangleAlert className="text-amber-600" />
              <AlertDescription>Copy it now. It won&apos;t be shown again; only a hash is stored.</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all" data-testid="new-api-key">
                {key}
              </code>
              <Button
                size="icon"
                variant="outline"
                aria-label="Copy key"
                onClick={async () => {
                  await navigator.clipboard.writeText(key);
                  setCopied(true);
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="k-label">Label (optional)</Label>
            <Input id="k-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Recording PC 2" />
          </div>
        )}
        <DialogFooter>
          {key ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button onClick={create} disabled={pending}>
              Create key
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeKeyButton({ id, prefix }: { id: string; prefix: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke key rig_${prefix}_…? Requests using it fail immediately.`)) return;
        startTransition(async () => {
          const res = await revokeApiKey(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Key revoked");
          router.refresh();
        });
      }}
    >
      Revoke
    </Button>
  );
}
