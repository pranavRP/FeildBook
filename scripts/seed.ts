/** Local demo password for every seeded user (letters + digits, as the auth config requires). */
export const DEMO_PASSWORD = "Fieldbook2026";

/**
 * Seeds demo users (one per role, password DEMO_PASSWORD) and rigs, and creates one API key for the
 * simulator (written to .env.local as FIELDBOOK_API_KEY). Idempotent.
 *
 *   pnpm seed
 */
import { readFileSync, writeFileSync } from "node:fs";
import { adminClient, loadEnv } from "./lib/env";
import { generateApiKey, hashApiKey, parseApiKey } from "../src/lib/api-keys";

loadEnv();
const db = adminClient();

export const DEMO_USERS = [
  { email: "admin@example.com", full_name: "Avery Admin", role: "admin", is_contractor: false },
  { email: "designer@example.com", full_name: "Dana Designer", role: "designer", is_contractor: false },
  { email: "operator@example.com", full_name: "Omar Operator", role: "operator", is_contractor: false },
  { email: "jordan@example.com", full_name: "Jordan Lee", role: "operator", is_contractor: false },
  { email: "contractor@example.com", full_name: "Casey Contractor", role: "operator", is_contractor: true },
  { email: "viewer@example.com", full_name: "Vic Viewer", role: "viewer", is_contractor: false },
] as const;

const RIGS = [
  { name: "Rig A", arm_model: "7-DoF cobot", headset: "Quest 3 + wand", arms: 1 },
  { name: "Rig B", arm_model: "7-DoF cobot (bimanual)", headset: "Quest 3 + wand", arms: 2 },
  { name: "Rig C", arm_model: "7-DoF cobot", headset: "Quest 3S + wand", arms: 1 },
];

async function main() {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = new Set(list.users.map((u) => u.email?.toLowerCase()));

  for (const u of DEMO_USERS) {
    if (existing.has(u.email)) continue;
    const { error: e } = await db.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
      app_metadata: { role: u.role, is_contractor: u.is_contractor },
    });
    if (e) throw new Error(`${u.email}: ${e.message}`);
    console.log(`created user ${u.email} (${u.role})`);
  }

  const { data: rigs } = await db.from("rigs").select("id, name");
  const rigNames = new Set((rigs ?? []).map((r) => r.name));
  const newRigs = RIGS.filter((r) => !rigNames.has(r.name));
  if (newRigs.length) {
    const { error: e } = await db.from("rigs").insert(newRigs);
    if (e) throw e;
    console.log(`created ${newRigs.length} rigs`);
  }

  // Simulator key for Rig A. Reuses FIELDBOOK_API_KEY from .env.local if present
  // (e.g. after a db reset), otherwise creates one and appends it to .env.local.
  const { data: rigA } = await db.from("rigs").select("id").eq("name", "Rig A").single();
  const existingKey = process.env.FIELDBOOK_API_KEY;
  const parsed = existingKey ? parseApiKey(existingKey) : null;
  if (existingKey && parsed) {
    const { data: row } = await db.from("api_keys").select("id").eq("prefix", parsed.prefix).maybeSingle();
    if (!row) {
      const { error: e } = await db
        .from("api_keys")
        .insert({ rig_id: rigA!.id, prefix: parsed.prefix, key_hash: hashApiKey(existingKey), label: "Simulator" });
      if (e) throw e;
      console.log(`registered simulator API key rig_${parsed.prefix}_… from .env.local`);
    }
  } else {
    const k = generateApiKey();
    const { error: e } = await db
      .from("api_keys")
      .insert({ rig_id: rigA!.id, prefix: k.prefix, key_hash: k.hash, label: "Simulator" });
    if (e) throw e;
    let envText = "";
    try {
      envText = readFileSync(".env.local", "utf8");
    } catch {}
    const lines = envText.split("\n").filter((l) => !/^FIELDBOOK_(URL|API_KEY)=/.test(l));
    writeFileSync(".env.local", [...lines, "FIELDBOOK_URL=http://localhost:3000", `FIELDBOOK_API_KEY=${k.key}`, ""].join("\n").replace(/\n{3,}/g, "\n\n"));
    console.log(`created simulator API key rig_${k.prefix}_… (saved to .env.local)`);
  }
  console.log("seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
