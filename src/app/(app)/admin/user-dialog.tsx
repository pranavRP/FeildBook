"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Role } from "@/lib/auth";
import { createUser, updateUser } from "./actions";

type User = { id: string; email: string; full_name: string | null; role: Role; is_contractor: boolean; venue_ids: string[] };

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including users, rigs and API keys.",
  designer: "Creates and edits tasks, scenes and props at every venue.",
  operator: "Records episodes and feasibility results at assigned venues.",
  viewer: "Read-only access to assigned venues. New sign-ups start here.",
};

export function UserDialog({
  user,
  venues,
  trigger,
}: {
  user?: User;
  venues: { id: string; name: string }[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.full_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "operator");
  const [contractor, setContractor] = useState(user?.is_contractor ?? false);
  const [venueIds, setVenueIds] = useState<string[]>(user?.venue_ids ?? []);
  const [password, setPassword] = useState("");
  const needsVenues = role === "operator" || role === "viewer";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { full_name: name, role, is_contractor: contractor, venue_ids: venueIds };
    startTransition(async () => {
      const res = user
        ? await updateUser(user.id, { ...payload, new_password: password })
        : await createUser({ ...payload, email, password });
      if (!res.ok) return void toast.error(res.error);
      toast.success(user ? "User updated" : `Account created for ${email}`);
      setPassword("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{user ? "Edit user" : "Add a user"}</DialogTitle>
            <DialogDescription>
              {user ? user.email : "Creates the account with a starting password. Share it with them privately."}
            </DialogDescription>
          </DialogHeader>
          {!user && (
            <div className="space-y-2">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-password">{user ? "New password (optional)" : "Starting password"}</Label>
            <Input
              id="u-password"
              type="text"
              autoComplete="new-password"
              required={!user}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={user ? "Leave empty to keep the current one" : "8+ characters, letters and numbers"}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              Contractor
              <span className="block text-xs text-muted-foreground">Flag for reporting; access still follows role and venues.</span>
            </span>
            <Switch checked={contractor} onCheckedChange={setContractor} />
          </label>
          <div className="space-y-2">
            <Label>Venues</Label>
            <p className="text-xs text-muted-foreground">
              {needsVenues ? "Operators and viewers only see these venues." : "Admins and designers see every venue."}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {venues.map((v) => (
                <label key={v.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
                  <Checkbox
                    checked={venueIds.includes(v.id)}
                    onCheckedChange={(c) => setVenueIds((ids) => (c ? [...ids, v.id] : ids.filter((x) => x !== v.id)))}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {user ? "Save" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
