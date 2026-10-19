import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;
const TABLES = ["tasks", "scenes", "scene_photos", "venues", "props", "task_props", "profiles", "venue_assignments", "rigs", "api_keys", "sessions", "episodes"];

function summarize(action: string, diff: unknown): string {
  if (!diff || typeof diff !== "object") return "";
  const d = diff as Record<string, unknown>;
  if (action === "update") {
    return Object.entries(d)
      .slice(0, 4)
      .map(([k, v]) => {
        const { old: o, new: n } = (v ?? {}) as { old: unknown; new: unknown };
        const fmt = (x: unknown) => (typeof x === "string" ? (x.length > 40 ? `${x.slice(0, 40)}…` : x) : JSON.stringify(x));
        return `${k}: ${fmt(o)} → ${fmt(n)}`;
      })
      .join(" · ");
  }
  const label = d.code ?? d.name ?? d.email ?? d.instruction ?? d.outcome ?? "";
  return typeof label === "string" ? label.slice(0, 80) : "";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; table?: string }> }) {
  await requireViewer(["admin"]);
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const table = TABLES.includes(sp.table ?? "") ? sp.table : undefined;
  const supabase = await createClient();

  let q = supabase
    .from("audit_log")
    .select("id, actor_id, action, table_name, row_id, diff, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (table) q = q.eq("table_name", table);
  const [{ data: rows, count }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name, email")]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const href = (p: number, t = table) => `/admin/audit?${new URLSearchParams({ ...(t ? { table: t } : {}), ...(p ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant={table ? "ghost" : "secondary"}>
          <Link href={href(0, undefined)}>All</Link>
        </Button>
        {TABLES.map((t) => (
          <Button key={t} asChild size="sm" variant={table === t ? "secondary" : "ghost"}>
            <Link href={href(0, t)}>{t}</Link>
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows?.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular">{format(new Date(r.created_at), "MMM d, HH:mm:ss")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.actor_id ? (who.get(r.actor_id) ?? "Unknown") : <span className="text-muted-foreground">system / API</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge variant={r.action === "delete" ? "destructive" : r.action === "insert" ? "secondary" : "outline"}>{r.action}</Badge>{" "}
                  <span className="text-muted-foreground">{r.table_name}</span>
                </td>
                <td className="max-w-md px-3 py-2 text-xs break-words text-muted-foreground">{summarize(r.action, r.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular">
          {count ? `${page * PAGE + 1}–${Math.min(count, page * PAGE + PAGE)} of ${count}` : "No entries"}
        </span>
        <div className="flex gap-2">
          <PageLink href={page > 0 ? href(page - 1) : null}>Newer</PageLink>
          <PageLink href={count && (page + 1) * PAGE < count ? href(page + 1) : null}>Older</PageLink>
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{children}</Link>
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled>
      {children}
    </Button>
  );
}
