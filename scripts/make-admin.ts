/**
 * Promotes an existing account (e.g. one you created on the sign-up page) to admin.
 *
 *   pnpm make-admin you@gmail.com
 */
import { adminClient, loadEnv } from "./lib/env";

loadEnv();
const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: pnpm make-admin <email>");
  process.exit(2);
}

async function main() {
  const db = adminClient();
  const { data: profile } = await db.from("profiles").select("id, role").ilike("email", email!).maybeSingle();
  if (!profile) throw new Error(`No account for ${email}. Sign up first on the login page.`);
  const { error } = await db.from("profiles").update({ role: "admin", active: true }).eq("id", profile.id);
  if (error) throw error;
  const { error: authError } = await db.auth.admin.updateUserById(profile.id, { app_metadata: { role: "admin" } });
  if (authError) throw authError;
  console.log(`${email}: ${profile.role} → admin`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
