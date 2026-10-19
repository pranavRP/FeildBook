"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SearchHit = { kind: "task" | "scene"; id: string; title: string; subtitle: string; href: string };

const querySchema = z.string().trim().min(1).max(100);

/** Global search (tasks by code/instruction, scenes by name). RLS limits results. */
export async function globalSearch(raw: string): Promise<SearchHit[]> {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success || !(await getViewer())) return [];
  const q = parsed.data.replace(/[%_,()]/g, " ");
  const supabase = await createClient();

  const [tasks, scenes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, code, instruction, scenes(name)")
      .or(`instruction.ilike.%${q}%,code.ilike.%${q}%`)
      .eq("archived", false)
      .limit(8),
    supabase.from("scenes").select("id, name, venues(name)").ilike("name", `%${q}%`).limit(4),
  ]);

  return [
    ...(tasks.data ?? []).map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.instruction,
      subtitle: `${t.code} · ${t.scenes?.name ?? ""}`,
      href: `/tasks/${t.code}`,
    })),
    ...(scenes.data ?? []).map((s) => ({
      kind: "scene" as const,
      id: s.id,
      title: s.name,
      subtitle: s.venues?.name ?? "",
      href: `/venues/scenes/${s.id}`,
    })),
  ];
}
