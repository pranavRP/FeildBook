import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

/** Loads .env.local (then .env) for scripts run with tsx. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file not present
    }
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return v;
}

/** Service-role client for trusted scripts. */
export function adminClient() {
  return createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
