/**
 * Post-import demo data: venue assignments and 14 days of synthetic episode
 * history so the dashboard has something to show. Run after the importer.
 *
 *   pnpm seed:episodes            # skips if synthetic history already exists
 *   pnpm seed:episodes --reset    # deletes synthetic sessions/episodes first
 */
import { randomUUID } from "node:crypto";
import { adminClient, loadEnv } from "./lib/env";
import { FAILURE_REASONS } from "../src/lib/status";

loadEnv();
const db = adminClient();
const RESET = process.argv.includes("--reset");
const DAYS = 14;

// Small deterministic PRNG so re-seeding gives the same charts.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

async function main() {
  const { data: profiles } = await db.from("profiles").select("id, email, role");
  const byEmail = new Map((profiles ?? []).map((p) => [p.email, p]));
  const { data: venues } = await db.from("venues").select("id, name").order("name");
  const { data: rigs } = await db.from("rigs").select("id, name").order("name");
  if (!venues?.length || !rigs?.length) throw new Error("Run `pnpm seed` and `pnpm import:xlsx` first.");

  // ---- Venue assignments --------------------------------------------------
  const office = venues.find((v) => /office/i.test(v.name)) ?? venues[0];
  const showroom = venues.find((v) => v.id !== office.id) ?? venues[0];
  const assignments = [
    ...venues.map((v) => ({ email: "operator@example.com", venue: v.id })),
    ...venues.map((v) => ({ email: "jordan@example.com", venue: v.id })),
    { email: "contractor@example.com", venue: office.id },
    { email: "viewer@example.com", venue: showroom.id },
  ].flatMap(({ email, venue }) => {
    const p = byEmail.get(email);
    return p ? [{ user_id: p.id, venue_id: venue }] : [];
  });
  const { error: aErr } = await db
    .from("venue_assignments")
    .upsert(assignments, { onConflict: "venue_id,user_id", ignoreDuplicates: true });
  if (aErr) throw aErr;
  console.log(`venue assignments: ${assignments.length}`);

  // ---- Synthetic history --------------------------------------------------
  if (RESET) {
    const { data: synth } = await db.from("sessions").select("id").eq("notes", "synthetic");
    const ids = (synth ?? []).map((s) => s.id);
    if (ids.length) {
      await db.from("episodes").delete().in("session_id", ids);
      await db.from("sessions").delete().in("id", ids);
      console.log(`removed ${ids.length} synthetic sessions`);
    }
  } else {
    const { count } = await db.from("sessions").select("id", { count: "exact", head: true }).eq("notes", "synthetic");
    if (count) {
      console.log("synthetic history already present (use --reset to regenerate)");
      return;
    }
  }

  const { data: tasks } = await db
    .from("tasks")
    .select("id, code, status, target_episodes, current_version, scenes(venue_id)")
    .in("status", ["done", "ready"])
    .order("code");
  const operators = ["operator@example.com", "jordan@example.com", "contractor@example.com"]
    .map((e) => byEmail.get(e))
    .filter((p): p is NonNullable<typeof p> => !!p);

  // Done tasks reach exactly their target; about half of the ready tasks get partial progress.
  const plan = (tasks ?? []).flatMap((t) => {
    if (t.status === "done") return [{ task: t, successes: t.target_episodes }];
    if (rand() < 0.5) return [{ task: t, successes: 5 + Math.floor(rand() * 30) }];
    return [];
  });

  type Ep = {
    external_id: string;
    task_id: string;
    task_version: number;
    outcome: "success" | "failure" | "aborted";
    failure_reason: string | null;
    duration_s: number;
    created_at: string;
    venue_id: string;
    metadata: { synthetic: true };
  };
  const episodes: Ep[] = [];
  for (const { task, successes } of plan) {
    let s = 0;
    while (s < successes) {
      const r = rand();
      const outcome = r < 0.75 ? "success" : r < 0.95 ? "failure" : "aborted";
      if (outcome === "success") s++;
      // Skew toward recent days so the chart trends upward.
      const daysAgo = Math.floor(DAYS * Math.pow(rand(), 1.6));
      const t = new Date();
      t.setDate(t.getDate() - daysAgo);
      t.setHours(9 + Math.floor(rand() * 8), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (t > new Date()) t.setTime(Date.now() - Math.floor(rand() * 3_600_000));
      episodes.push({
        external_id: randomUUID(),
        task_id: task.id,
        task_version: task.current_version,
        outcome,
        failure_reason: outcome === "failure" ? pick(FAILURE_REASONS) : outcome === "aborted" ? "Operator error" : null,
        duration_s: Math.round((25 + rand() * 70) * 10) / 10,
        created_at: t.toISOString(),
        venue_id: task.scenes!.venue_id,
        metadata: { synthetic: true },
      });
    }
  }

  // One session per (day, venue, operator); episodes are assigned round-robin.
  const sessions = new Map<string, { id: string; started: string; ended: string }>();
  const sessionRows: Record<string, unknown>[] = [];
  episodes.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const final = episodes.map((e) => {
    const day = e.created_at.slice(0, 10);
    const op = operators[Math.floor(rand() * operators.length)];
    const operator = op.email === "contractor@example.com" && e.venue_id !== office.id ? operators[0] : op;
    const key = `${day}|${e.venue_id}|${operator.id}`;
    let s = sessions.get(key);
    if (!s) {
      s = { id: randomUUID(), started: e.created_at, ended: e.created_at };
      sessions.set(key, s);
      sessionRows.push({
        id: s.id,
        operator_id: operator.id,
        venue_id: e.venue_id,
        rig_id: pick(rigs).id,
        source: rand() < 0.5 ? "api" : "ui",
        notes: "synthetic",
      });
    }
    s.ended = e.created_at;
    const { external_id, task_id, task_version, outcome, failure_reason, duration_s, created_at, metadata } = e;
    return { external_id, task_id, task_version, outcome, failure_reason, duration_s, created_at, metadata, session_id: s.id };
  });
  for (const row of sessionRows) {
    const s = [...sessions.values()].find((x) => x.id === row.id)!;
    row.started_at = new Date(new Date(s.started).getTime() - 5 * 60_000).toISOString();
    row.ended_at = new Date(new Date(s.ended).getTime() + 2 * 60_000).toISOString();
  }

  const { error: sErr } = await db.from("sessions").insert(sessionRows as never);
  if (sErr) throw sErr;
  for (let i = 0; i < final.length; i += 200) {
    const { error } = await db.from("episodes").insert(final.slice(i, i + 200));
    if (error) throw error;
  }
  console.log(`sessions: ${sessionRows.length}, episodes: ${final.length} across ${plan.length} tasks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
