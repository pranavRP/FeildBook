import type { Metadata } from "next";
import { Pencil, UserPlus } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { UserDialog } from "./user-dialog";
import { ActiveToggle } from "./user-actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireViewer(["admin"]);
  const supabase = await createClient();
  const [{ data: profiles }, { data: venues }, { data: assignments }, authUsers] = await Promise.all([
    supabase.from("profiles").select("*").order("active", { ascending: false }).order("role").order("full_name"),
    supabase.from("venues").select("id, name").eq("archived", false).order("name"),
    supabase.from("venue_assignments").select("user_id, venue_id"),
    // Admin-only page: last sign-in comes from the auth admin API.
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const lastSignIn = new Map(authUsers.data.users.map((u) => [u.id, u.last_sign_in_at]));
  const venueName = new Map((venues ?? []).map((v) => [v.id, v.name]));
  const venuesFor = (id: string) => (assignments ?? []).filter((a) => a.user_id === id).map((a) => a.venue_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{profiles?.filter((p) => p.active).length} active users</p>
        <UserDialog venues={venues ?? []} trigger={<Button><UserPlus /> Add user</Button>} />
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {profiles?.map((p) => {
          const vids = venuesFor(p.id);
          const seen = lastSignIn.get(p.id);
          return (
            <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={p.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                    {p.full_name ?? p.email}
                  </span>
                  <Badge variant={p.role === "admin" ? "default" : "secondary"} className="capitalize">
                    {p.role}
                  </Badge>
                  {p.is_contractor && <Badge variant="outline">Contractor</Badge>}
                  {!p.active && <Badge variant="destructive">Deactivated</Badge>}
                  {p.id === me.id && <Badge variant="outline">You</Badge>}
                </div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">{p.email}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.role === "admin" || p.role === "designer"
                    ? "All venues"
                    : vids.length
                      ? vids.map((v) => venueName.get(v)).join(", ")
                      : "No venues assigned"}
                  {" · "}
                  {seen ? `Last sign-in ${formatDistanceToNow(new Date(seen), { addSuffix: true })}` : "Never signed in"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <UserDialog
                  user={{ ...p, venue_ids: vids }}
                  venues={venues ?? []}
                  trigger={
                    <Button size="sm" variant="ghost">
                      <Pencil /> Edit
                    </Button>
                  }
                />
                <ActiveToggle id={p.id} active={p.active} name={p.full_name ?? p.email} disabled={p.id === me.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
