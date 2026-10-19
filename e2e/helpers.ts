import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile?.(".env.local");

/** Local demo password set by `pnpm seed`. */
export const DEMO_PASSWORD = "Fieldbook2026";

/** Signs in through the real UI with email + password. */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
}

export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
