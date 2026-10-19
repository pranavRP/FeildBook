import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { Bot, Pencil, Plus } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewKeyDialog, RevokeKeyButton, RigDialog } from "./rig-dialogs";

export const metadata: Metadata = { title: "Rigs & API keys" };

export default async function RigsPage() {
  await requireViewer(["admin"]);
  const supabase = await createClient();
  const { data: rigs } = await supabase
    .from("rigs")
    .select("*, api_keys(id, prefix, label, created_at, last_used_at, revoked_at)")
    .order("name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          One key per recording PC. Keys are stored hashed and can be revoked instantly.
        </p>
        <RigDialog trigger={<Button><Plus /> Rig</Button>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rigs?.map((rig) => {
          const keys = [...rig.api_keys].sort((a, b) => Number(!!a.revoked_at) - Number(!!b.revoked_at) || b.created_at.localeCompare(a.created_at));
          return (
            <Card key={rig.id} className={rig.active ? "" : "opacity-70"}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="size-4 text-muted-foreground" /> {rig.name}
                    {!rig.active && <Badge variant="outline">Inactive</Badge>}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[rig.arm_model, rig.headset, `${rig.arms} arm${rig.arms === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <RigDialog rig={rig} trigger={<Button size="icon-sm" variant="ghost" aria-label={`Edit ${rig.name}`}><Pencil /></Button>} />
                  <NewKeyDialog rigId={rig.id} rigName={rig.name} />
                </div>
              </CardHeader>
              <CardContent>
                {keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No API keys yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {keys.map((k) => (
                      <li key={k.id} className="flex items-center gap-3 py-2">
                        <code className={`font-mono text-xs ${k.revoked_at ? "text-muted-foreground line-through" : ""}`}>
                          rig_{k.prefix}_••••
                        </code>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {k.label ?? "Unlabeled"} ·{" "}
                          {k.revoked_at
                            ? `revoked ${formatDistanceToNow(new Date(k.revoked_at), { addSuffix: true })}`
                            : k.last_used_at
                              ? `used ${formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })}`
                              : "never used"}
                        </span>
                        {!k.revoked_at && <RevokeKeyButton id={k.id} prefix={k.prefix} />}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
