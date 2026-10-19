"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { must, runAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

const keysSchema = z.array(z.object({ task_id: z.uuid(), prop_id: z.uuid() })).min(1).max(200);

/** Marks a prop as bought (or not) for the given task links. */
export async function setAcquired(keys: unknown, acquired: boolean) {
  return runAction(async () => {
    await assertRole(["admin", "designer"]);
    const parsed = keysSchema.parse(keys);
    const supabase = await createClient();
    const propIds = [...new Set(parsed.map((k) => k.prop_id))];
    const taskIds = [...new Set(parsed.map((k) => k.task_id))];
    const rows = must(
      await supabase
        .from("task_props")
        .update({ acquired })
        .in("prop_id", propIds)
        .in("task_id", taskIds)
        .eq("source", "to_buy")
        .select("task_id"),
    );
    revalidatePath("/shopping");
    return rows.length;
  });
}
