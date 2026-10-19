/**
 * Fails if any server secret appears in the client bundle (.next/static).
 * Run after `pnpm build`:  pnpm check:bundle
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./lib/env";

loadEnv();
const ROOT = ".next/static";
const secrets: [string, string][] = [];
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (service) {
  secrets.push(["SUPABASE_SERVICE_ROLE_KEY", service]);
  // Also the JWT payload segment, in case the key were split or re-encoded.
  const payload = service.split(".")[1];
  if (payload) secrets.push(["service-role JWT payload", payload]);
}
if (process.env.FIELDBOOK_API_KEY) secrets.push(["FIELDBOOK_API_KEY", process.env.FIELDBOOK_API_KEY]);
secrets.push(["env var name SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

let scanned = 0;
const hits: string[] = [];
try {
  for (const f of files(ROOT)) {
    const text = readFileSync(f, "latin1");
    scanned++;
    for (const [label, value] of secrets) if (text.includes(value)) hits.push(`${label} in ${f}`);
  }
} catch {
  console.error(`No ${ROOT} directory. Run \`pnpm build\` first.`);
  process.exit(2);
}

if (hits.length) {
  console.error("SECRET FOUND IN CLIENT BUNDLE:\n" + hits.map((h) => `  - ${h}`).join("\n"));
  process.exit(1);
}
console.log(`OK: scanned ${scanned} client files; no server secrets found (${secrets.length} patterns).`);
