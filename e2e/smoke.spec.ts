import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { login, serviceClient as admin } from "./helpers";

test("designer: login → tasks → scene → upload photo (EXIF stripped)", async ({ page }) => {
  await login(page, "designer@example.com");

  // Tasks
  await page.getByRole("link", { name: "Tasks" }).first().click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  // Scene
  await page.getByRole("link", { name: "Venues & Scenes" }).first().click();
  await expect(page.getByRole("heading", { name: "Venues & Scenes" })).toBeVisible();
  await page.getByRole("link", { name: /Coffee counter/ }).click();
  await expect(page.getByRole("heading", { name: "Coffee counter" })).toBeVisible();
  const sceneId = page.url().split("/").pop()!;

  // Upload a JPEG carrying EXIF metadata.
  const db = admin();
  const { data: leftovers } = await db.from("scene_photos").select("id, storage_path, thumb_path").eq("caption", "e2e upload");
  for (const p of leftovers ?? []) {
    await db.storage.from("scene-photos").remove([p.storage_path, p.thumb_path]);
    await db.from("scene_photos").delete().eq("id", p.id);
  }
  const background = { r: Math.floor(Math.random() * 255), g: 96, b: 192 };
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background } })
    .withExif({ IFD0: { ImageDescription: "e2e-secret-location", Copyright: "e2e" } })
    .jpeg()
    .toBuffer();
  expect((await sharp(jpeg).metadata()).exif).toBeDefined();

  await page.getByRole("button", { name: "Add photos" }).click();
  await page.getByTestId("file-input").setInputFiles({ name: "e2e.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.getByRole("radio", { name: "layout" }).click();
  await page.getByLabel("Caption (optional)").fill("e2e upload");
  await page.getByRole("button", { name: /Upload 1 photo/ }).click();
  await expect(page.getByText("1 photo uploaded")).toBeVisible();
  await expect(page.getByRole("radio", { name: /layout 1/i })).toBeVisible();

  // The stored object has no metadata.
  const { data: photo } = await db
    .from("scene_photos")
    .select("id, storage_path, thumb_path")
    .eq("scene_id", sceneId)
    .eq("caption", "e2e upload")
    .single();
  const { data: blob } = await db.storage.from("scene-photos").download(photo!.storage_path);
  const meta = await sharp(Buffer.from(await blob!.arrayBuffer())).metadata();
  expect(meta.exif).toBeUndefined();

  // Clean up.
  await db.storage.from("scene-photos").remove([photo!.storage_path, photo!.thumb_path]);
  await db.from("scene_photos").delete().eq("id", photo!.id);
});

test("designer: create task, duplicate warning, edit creates a version", async ({ page }) => {
  await login(page, "designer@example.com");
  await page.goto("/tasks/new");

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Coffee counter" }).click();
  await page.getByLabel("Instruction").fill("Put the loose stirrers back into the red cup, upright");
  await expect(page.getByText("Possible duplicate")).toBeVisible();

  const unique = `E2E: stack the two paper cups on the coaster ${Date.now()}`;
  await page.getByLabel("Instruction").fill(unique);
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/T-\d+$/);
  await expect(page.getByText(unique).first()).toBeVisible();
  const code = page.url().split("/").pop()!;

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Instruction").fill(`${unique} (gently)`);
  await page.getByLabel("Why did the instruction change?").fill("cups tipped over");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/tasks/${code}$`));
  await expect(page.getByText("“cups tipped over”")).toBeVisible();
  await expect(page.getByText("v2", { exact: true }).first()).toBeVisible();

  await admin().from("tasks").delete().eq("code", code);
});

test("a task created as Ready appears in the operator tool's API", async ({ page, request }) => {
  await login(page, "designer@example.com");
  await page.goto("/tasks/new");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Coffee counter" }).click();
  const instruction = `E2E: wipe the counter beside the espresso machine ${Date.now()}`;
  await page.getByLabel("Instruction").fill(instruction);
  await page.getByRole("switch", { name: "Ready for operators" }).click();
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/T-\d+$/);
  const code = page.url().split("/").pop()!;
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();

  const res = await request.get("/api/v1/tasks", {
    headers: { Authorization: `Bearer ${process.env.FIELDBOOK_API_KEY}` },
  });
  expect(res.ok()).toBeTruthy();
  const { tasks } = (await res.json()) as { tasks: { code: string; instruction: string }[] };
  expect(tasks.find((t) => t.code === code)?.instruction).toBe(instruction);

  // Un-publish: Ready → Proposed removes it from the feed.
  await page.getByRole("button", { name: /Move to Proposed/ }).click();
  await expect(page.getByText("Moved to Proposed")).toBeVisible();
  const after = (await (await request.get("/api/v1/tasks", { headers: { Authorization: `Bearer ${process.env.FIELDBOOK_API_KEY}` } })).json()) as {
    tasks: { code: string }[];
  };
  expect(after.tasks.some((t) => t.code === code)).toBe(false);

  await admin().from("tasks").delete().eq("code", code);
});
