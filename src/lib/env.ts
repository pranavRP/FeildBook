// Public (browser-safe) configuration. Secrets live in `server-env.ts`.
// NEXT_PUBLIC_* values must be read with literal property access so Next can inline them.
export const publicEnv = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Fieldbook",
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
