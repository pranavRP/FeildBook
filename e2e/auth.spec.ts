import { test, expect } from "@playwright/test";
import { anonClient, login, serviceClient } from "./helpers";

test("anyone can sign up with a personal email and lands as a viewer", async ({ page }) => {
  const email = `newperson-${Date.now()}@gmail.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("New Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("goodpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), New/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/\?denied=1/);
  await page.goto("/tasks/new");
  await expect(page).toHaveURL(/\/\?denied=1/);

  // Sign out, sign back in with the password.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await login(page, email, "goodpass123");
});

test("sign-up cannot grant itself a role", async () => {
  const email = `sneaky-${Date.now()}@gmail.com`;
  const { data, error } = await anonClient().auth.signUp({
    email,
    password: "sneaky12345",
    options: { data: { role: "admin", full_name: "Sneaky" } },
  });
  expect(error).toBeNull();
  const { data: profile } = await serviceClient().from("profiles").select("role").eq("id", data.user!.id).single();
  expect(profile!.role).toBe("viewer");
});

test("wrong password is rejected without revealing whether the account exists", async ({ page }) => {
  for (const email of ["designer@example.com", "nobody-here@example.com"]) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrongpass1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
});

test("admin: add user, edit, rig key, audit log, deactivate", async ({ page }) => {
  await login(page, "admin@example.com");
  await page.goto("/admin");
  await expect(page.getByText("Dana Designer")).toBeVisible();

  const email = `added-${Date.now()}@gmail.com`;
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill("Added Person");
  await page.getByLabel("Starting password").fill("startpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`Account created for ${email}`)).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row.getByText("operator")).toBeVisible();

  // Rig key: shown once, then revocable.
  await page.goto("/admin/rigs");
  await page.getByRole("button", { name: "New key" }).last().click();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByTestId("new-api-key")).toHaveText(/^rig_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);
  await page.getByRole("button", { name: "Done" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await expect(page.getByText("Key revoked")).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByRole("cell", { name: "api_keys" }).first()).toBeVisible();

  // Deactivate the new user: effective immediately.
  await page.goto("/admin");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem").filter({ hasText: email }).getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Added Person deactivated")).toBeVisible();
  const { error } = await anonClient().auth.signInWithPassword({ email, password: "startpass123" });
  expect(error).not.toBeNull();
});

test("viewer cannot open the admin area", async ({ page }) => {
  await login(page, "viewer@example.com");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/\?denied=1/);
});
