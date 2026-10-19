import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Options for the task form: active scenes (with venue) and existing prop names. */
export async function taskFormOptions() {
  const supabase = await createClient();
  const [{ data: scenes }, { data: props }] = await Promise.all([
    supabase.from("scenes").select("id, name, venues(name)").eq("archived", false).order("name"),
    supabase.from("props").select("name").order("name"),
  ]);
  return {
    scenes: (scenes ?? [])
      .map((s) => ({ id: s.id, name: s.name, venue: s.venues?.name ?? "" }))
      .sort((a, b) => a.venue.localeCompare(b.venue) || a.name.localeCompare(b.name)),
    propNames: (props ?? []).map((p) => p.name),
  };
}
