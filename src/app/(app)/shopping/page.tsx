import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { requireViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ShoppingList, type ShoppingItem } from "./shopping-list";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Shopping list" };

export default async function ShoppingPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const viewer = await requireViewer();
  const showAll = (await searchParams).show === "all";
  const supabase = await createClient();

  let query = supabase
    .from("task_props")
    .select(
      "task_id, prop_id, qty, acquired, props(name), tasks!inner(code, instruction, status, archived, scenes(venues(id, name)))",
    )
    .eq("source", "to_buy")
    .eq("tasks.archived", false)
    .not("tasks.status", "in", "(done,infeasible)");
  if (!showAll) query = query.eq("acquired", false);
  const { data } = await query;

  // venue -> prop -> aggregated item
  const venues = new Map<string, { name: string; items: Map<string, ShoppingItem> }>();
  for (const row of data ?? []) {
    const venue = row.tasks.scenes?.venues;
    if (!venue || !row.props) continue;
    if (!venues.has(venue.id)) venues.set(venue.id, { name: venue.name, items: new Map() });
    const items = venues.get(venue.id)!.items;
    const key = `${venue.id}:${row.prop_id}`;
    const item = items.get(key) ?? { key, name: row.props.name, qty: 0, acquired: true, links: [], tasks: [] };
    item.qty += row.qty;
    item.acquired &&= row.acquired;
    item.links.push({ task_id: row.task_id, prop_id: row.prop_id });
    item.tasks.push({ code: row.tasks.code, instruction: row.tasks.instruction });
    items.set(key, item);
  }
  const groups = [...venues.values()]
    .map((v) => ({ name: v.name, items: [...v.items.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = groups.reduce((n, g) => n + g.items.filter((i) => !i.acquired).length, 0);

  return (
    <>
      <PageHeader
        title="Shopping list"
        description={`${total} item${total === 1 ? "" : "s"} still to buy for active tasks, grouped by venue.`}
        actions={
          <div className="no-print flex gap-2">
            <Button asChild variant="ghost">
              <Link href={showAll ? "/shopping" : "/shopping?show=all"}>{showAll ? "Hide bought" : "Show bought"}</Link>
            </Button>
            <PrintButton />
          </div>
        }
      />
      {groups.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nothing to buy" description="Every to-buy prop for active tasks is acquired." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2 print:block">
          {groups.map((g) => (
            <section key={g.name} className="print:mb-6">
              <h2 className="mb-3 flex items-baseline gap-2 font-semibold">
                {g.name}
                <span className="text-sm font-normal text-muted-foreground">{g.items.length} items</span>
              </h2>
              <ShoppingList items={g.items} canEdit={isStaff(viewer.role)} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
