"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { setAcquired } from "./actions";

export type ShoppingItem = {
  key: string;
  name: string;
  qty: number;
  acquired: boolean;
  links: { task_id: string; prop_id: string }[];
  tasks: { code: string; instruction: string }[];
};

export function ShoppingList({ items, canEdit }: { items: ShoppingItem[]; canEdit: boolean }) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, { key, acquired }: { key: string; acquired: boolean }) =>
    state.map((i) => (i.key === key ? { ...i, acquired } : i)),
  );

  function toggle(item: ShoppingItem, acquired: boolean) {
    startTransition(async () => {
      setOptimistic({ key: item.key, acquired });
      const res = await setAcquired(item.links, acquired);
      if (!res.ok) toast.error(res.error);
      else if (acquired) toast.success(`${item.name} marked as bought`);
    });
  }

  return (
    <ul className="divide-y rounded-xl border bg-card print:rounded-none print:border-0">
      {optimistic.map((item) => (
        <li key={item.key} className="flex items-start gap-3 p-3 print:break-inside-avoid print:py-2">
          <Checkbox
            className="mt-0.5 size-5"
            checked={item.acquired}
            disabled={!canEdit}
            onCheckedChange={(c) => toggle(item, c === true)}
            aria-label={`Bought ${item.name}`}
          />
          <div className="min-w-0 flex-1">
            <div className={cn("font-medium", item.acquired && "text-muted-foreground line-through")}>
              <span className="mr-1.5 tabular text-muted-foreground">{item.qty}×</span>
              {item.name}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {item.tasks.map((t) => (
                <Link key={t.code} href={`/tasks/${t.code}`} className="hover:text-foreground" title={t.instruction}>
                  {t.code}
                </Link>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
