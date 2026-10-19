import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const run = promisify(execFile);

test("dashboard updates live while the rig simulator posts episodes", async ({ page }) => {
  await login(page, "designer@example.com");
  await expect(page.getByTestId("live-indicator")).toHaveAttribute("data-status", "live", { timeout: 15_000 });

  const tile = page.getByTestId("kpi-Episodes today");
  const before = Number((await tile.locator(".tabular").textContent())!.replace(/\D/g, ""));

  // Real API, real rig key: 3 episodes, fast.
  await run("pnpm", ["simulate", "--count", "3", "--fast"], {
    timeout: 60_000,
    env: { ...process.env, FIELDBOOK_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  });

  await expect
    .poll(async () => Number((await tile.locator(".tabular").textContent())!.replace(/\D/g, "")), { timeout: 15_000 })
    .toBe(before + 3);
});
