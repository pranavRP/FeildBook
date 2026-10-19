/**
 * Simulates a recording rig against the real Episode API so the dashboard
 * moves live during a demo. ~75% success, random failure reasons, 3–8 s apart.
 *
 *   pnpm simulate                          # until Ctrl+C
 *   pnpm simulate --count 20 --operator jordan@example.com --venue <uuid> --fast
 *
 * Uses FIELDBOOK_URL and FIELDBOOK_API_KEY (written to .env.local by `pnpm seed`).
 */
import { randomUUID } from "node:crypto";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();
const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const BASE = (process.env.FIELDBOOK_URL ?? "http://localhost:3000").replace(/\/$/, "") + "/api/v1";
const KEY = requireEnv("FIELDBOOK_API_KEY");
const COUNT = Number(arg("count") ?? Infinity);
const OPERATOR = arg("operator") ?? "operator@example.com";
const FAST = args.includes("--fast");
const FAILURES = ["Grasp slip", "Collision", "Reach limit", "Timeout", "Operator error", "Other"];

type Task = { code: string; instruction: string; venue: { id: string; name: string } | null; remaining_episodes: number; status: string };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const c = { dim: "\x1b[2m", green: "\x1b[32m", red: "\x1b[31m", bold: "\x1b[1m", reset: "\x1b[0m" };

async function main() {
  const health = await api<{ rig: { name: string } }>("GET", "/health");
  let { tasks } = await api<{ tasks: Task[] }>("GET", "/tasks?status=ready,collecting");
  if (!tasks.length) throw new Error("No ready/collecting tasks. Move some tasks to Ready first.");

  // Pick the venue with the most recordable tasks (or --venue).
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.venue) counts.set(t.venue.id, (counts.get(t.venue.id) ?? 0) + 1);
  const venueId = arg("venue") ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  tasks = tasks.filter((t) => t.venue?.id === venueId);
  const venueName = tasks[0]?.venue?.name ?? venueId;

  const { session_id } = await api<{ session_id: string }>("POST", "/sessions", { operator_email: OPERATOR, venue_id: venueId });
  console.log(`${c.bold}${health.rig.name}${c.reset} recording at ${venueName} as ${OPERATOR} · session ${session_id.slice(0, 8)}`);
  console.log(`${c.dim}${tasks.length} tasks · Ctrl+C to stop${c.reset}\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) process.exit(1);
    stopping = true;
    const { session } = await api<{ session: { episode_count: number } }>("PATCH", `/sessions/${session_id}`, { notes: "simulator" });
    console.log(`\nSession ended · ${session.episode_count} episodes`);
    process.exit(0);
  };
  process.on("SIGINT", stop);

  // Favour tasks that are already collecting and close to done (most satisfying on a dashboard).
  const weight = (t: Task) => (t.status === "collecting" ? 3 : 1) + (t.remaining_episodes < 15 ? 2 : 0);
  let sent = 0;
  while (sent < COUNT && tasks.length) {
    const total = tasks.reduce((n, t) => n + weight(t), 0);
    let r = Math.random() * total;
    const task = tasks.find((t) => (r -= weight(t)) < 0) ?? tasks[0];
    const success = Math.random() < 0.75;
    const failure = Math.random() < 0.85;
    const outcome = success ? "success" : failure ? "failure" : "aborted";
    const { episode } = await api<{ episode: { task: { remaining_episodes: number; status: string } } }>("POST", "/episodes", {
      external_id: randomUUID(),
      session_id,
      task_code: task.code,
      outcome,
      failure_reason: outcome === "failure" ? FAILURES[Math.floor(Math.random() * FAILURES.length)] : outcome === "aborted" ? "Operator error" : undefined,
      duration_s: Math.round((20 + Math.random() * 60) * 10) / 10,
      metadata: { simulated: true },
    });
    sent++;
    task.remaining_episodes = episode.task.remaining_episodes;
    task.status = episode.task.status;
    const mark = outcome === "success" ? `${c.green}✓ success${c.reset}` : `${c.red}✗ ${outcome}${c.reset}`;
    console.log(`${mark}  ${task.code}  ${c.dim}${task.remaining_episodes} to go${c.reset}  ${task.instruction.slice(0, 60)}`);
    if (task.status === "done") {
      console.log(`${c.bold}🎉 ${task.code} reached its target${c.reset}`);
      tasks = tasks.filter((t) => t !== task);
    }
    if (sent < COUNT) await sleep(FAST ? 400 : 3000 + Math.random() * 5000);
  }
  await stop();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
