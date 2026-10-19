/**
 * Imports the legacy task spreadsheet.
 *
 *   pnpm import:xlsx            # curated demo subset (default)
 *   pnpm import:xlsx --all      # every row
 *   options: --file <path>  --no-photos
 *
 * Idempotent: venues/scenes/props are matched by name, tasks by a normalized
 * instruction key, photos by content hash. Re-running only adds what's missing.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readWorkbook, countInCellImages, type Sheet } from "./lib/xlsx-reader";
import { adminClient, loadEnv } from "./lib/env";
import {
  armsRequired,
  cleanInstruction,
  createVenueAnonymizer,
  extractIteration,
  inferStatus,
  mentionsIteration,
  normalizeInstruction,
  parseProps,
  sceneNameFrom,
  type ParsedProp,
  type TaskStatusValue,
} from "../src/lib/import-rules";
import { processPhoto, storePhoto } from "../src/lib/photos";

loadEnv();
const args = process.argv.slice(2);
const FILE = args.includes("--file") ? args[args.indexOf("--file") + 1] : "data/tasks.xlsx";
const ALL = args.includes("--all");
const PHOTOS = !args.includes("--no-photos");
const ANONYMIZE = process.env.DEMO_ANONYMIZE === "true";

/** The demo subset: a handful of scenes with photos and a spread of statuses. */
const DEMO_SCENES = [
  "Storage room metal shelving 01",
  "Storage room metal shelving 02",
  "Coffee counter",
  "Pantry counter 01",
  "Small meeting room",
  "Break nook",
  "Server closet",
  "Kitchen sink",
];
const DEMO_TASKS_PER_SCENE = 4;
const DEMO_GENERAL_TASKS = 6;

type Row = {
  sheet: string;
  row: number;
  key: string;
  instruction: string;
  done: boolean;
  venue: string;
  scene: string;
  sceneDescription: string | null;
  props: ParsedProp[];
  notes: string | null;
  comments: string[];
};

const db = adminClient();
const report = {
  venues: { created: 0, existing: 0 },
  scenes: { created: 0, existing: 0 },
  tasks: { created: 0, existing: 0, versioned: 0 },
  props: { created: 0, existing: 0 },
  photos: { mapped: 0, unsorted: 0, skippedExisting: 0, skippedNotSelected: 0 },
  duplicatesMerged: 0,
  blankRowsSkipped: 0,
  inCellImages: 0,
};

/** Text in the "Scene description" column that is really a comment ("lid needs to be…"). */
function looksLikeComment(text: string) {
  return !text.includes(":") && /\b(need|needs|may|might|should|must|could)\b|^take\b/i.test(text);
}

function parseSheet(sheet: Sheet): Row[] {
  const out: Row[] = [];
  let venue = "";
  let scene: { venue: string; name: string; description: string } | null = null;

  for (const { row, cells } of sheet.rows) {
    if (row === 1) continue; // header
    const instruction = (cells.B ?? "").trim();
    const description = (cells.E ?? "").trim();
    if (cells.F?.trim()) venue = cells.F.trim();
    if (scene && scene.venue !== venue) scene = null;

    const comments = [cells.D, cells.I, cells.J].map((c) => c?.trim()).filter((c): c is string => !!c);
    if (description) {
      if (looksLikeComment(description)) comments.push(description);
      else scene = { venue, name: sceneNameFrom(description), description };
    }

    if (!instruction || /^add new task/i.test(instruction) || !venue) {
      report.blankRowsSkipped++;
      continue;
    }
    out.push({
      sheet: sheet.name,
      row,
      key: normalizeInstruction(instruction),
      instruction: cleanInstruction(instruction),
      done: cells.A === "1" || cells.A?.toUpperCase() === "TRUE",
      venue,
      scene: scene?.name ?? "General",
      sceneDescription: scene?.description ?? null,
      props: parseProps(cells.G),
      notes: cells.H?.trim() || null,
      comments,
    });
  }
  return out;
}

function pickDemo(rows: Row[]): Row[] {
  const byScene = new Map<string, Row[]>();
  for (const r of rows) byScene.set(r.scene, [...(byScene.get(r.scene) ?? []), r]);
  const picked: Row[] = [];
  for (const name of DEMO_SCENES) picked.push(...(byScene.get(name) ?? []).slice(0, DEMO_TASKS_PER_SCENE));
  const general = byScene.get("General") ?? [];
  const withIteration = general.filter((r) => extractIteration(r.notes));
  const rest = general.filter((r) => !withIteration.includes(r));
  picked.push(...[...withIteration, ...rest].slice(0, DEMO_GENERAL_TASKS));
  return picked;
}

/** Deterministic pseudo-random target for tasks already marked Done in the sheet. */
function syntheticTarget(key: string) {
  const n = createHash("sha256").update(key).digest().readUInt32BE(0);
  return 20 + (n % 21); // 20..40
}

type NamedRow = { name: string; address?: string | null; drive_folder_url?: string | null };

async function ensureByName<T extends { id: string; name: string }>(
  table: "venues" | "props",
  wanted: Map<string, NamedRow>,
  counter: { created: number; existing: number },
): Promise<Map<string, string>> {
  const { data, error } = await db.from(table).select("id, name");
  if (error) throw error;
  const ids = new Map((data as T[]).map((r) => [r.name.toLowerCase(), r.id]));
  const missing = [...wanted.entries()].filter(([k]) => !ids.has(k));
  counter.existing += wanted.size - missing.length;
  if (missing.length) {
    const { data: inserted, error: insErr } = await db
      .from(table)
      .insert(missing.map(([, v]) => v) as { name: string }[]) // venues also carry address/drive url
      .select("id, name");
    if (insErr) throw insErr;
    for (const r of inserted as T[]) ids.set(r.name.toLowerCase(), r.id);
    counter.created += missing.length;
  }
  return ids;
}

async function main() {
  const buffer = readFileSync(FILE);
  const sheets = readWorkbook(buffer);
  report.inCellImages = countInCellImages(buffer);
  const get = (name: string) => sheets.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const tasksSheet = get("Tasks");
  const readySheet = get("Ready to Go");
  if (!tasksSheet || !readySheet) throw new Error("Expected sheets 'Tasks' and 'Ready to Go'.");

  const taskRows = parseSheet(tasksSheet);
  const readyRows = parseSheet(readySheet);
  const readyKeys = new Set(readyRows.map((r) => r.key));

  // Merge both sheets; first occurrence (Tasks sheet) wins.
  const merged = new Map<string, Row>();
  for (const r of [...taskRows, ...readyRows]) {
    if (merged.has(r.key)) report.duplicatesMerged++;
    else merged.set(r.key, r);
  }
  const selected = ALL ? [...merged.values()] : pickDemo([...merged.values()]);
  const selectedKeys = new Set(selected.map((r) => r.key));
  const anon = createVenueAnonymizer(ANONYMIZE);

  // ---- Venues -------------------------------------------------------------
  const venueRows = new Map<string, NamedRow>();
  const venuesSheet = get("Venues");
  for (const { row, cells } of venuesSheet?.rows ?? []) {
    if (row === 1 || !cells.A?.trim()) continue;
    if (!ALL && !selected.some((r) => r.venue.toLowerCase() === cells.A.trim().toLowerCase())) continue;
    const name = anon(cells.A.trim());
    venueRows.set(name.toLowerCase(), {
      name,
      address: ANONYMIZE ? null : cells.C?.trim() || null,
      drive_folder_url: ANONYMIZE ? null : cells.B?.trim() || null,
    });
  }
  for (const r of selected) {
    const name = anon(r.venue);
    if (!venueRows.has(name.toLowerCase())) venueRows.set(name.toLowerCase(), { name });
  }
  const venueIds = await ensureByName("venues", venueRows, report.venues);
  const venueId = (raw: string) => venueIds.get(anon(raw).toLowerCase())!;

  // ---- Scenes -------------------------------------------------------------
  const { data: existingScenes, error: scErr } = await db.from("scenes").select("id, name, venue_id");
  if (scErr) throw scErr;
  const sceneIds = new Map(existingScenes.map((s) => [`${s.venue_id}|${s.name.toLowerCase()}`, s.id]));
  const touchedScenes = new Set<string>();
  async function sceneId(venue: string, name: string, description: string | null) {
    const vid = venueId(venue);
    const k = `${vid}|${name.toLowerCase()}`;
    if (sceneIds.has(k)) {
      if (!touchedScenes.has(k)) report.scenes.existing++;
      touchedScenes.add(k);
      return sceneIds.get(k)!;
    }
    const { data, error } = await db
      .from("scenes")
      .insert({
        venue_id: vid,
        name,
        description:
          description ?? (name === "Unsorted" ? "Imported photos that could not be matched to a scene." : null),
      })
      .select("id")
      .single();
    if (error) throw error;
    sceneIds.set(k, data.id);
    touchedScenes.add(k);
    report.scenes.created++;
    return data.id;
  }

  // ---- Props --------------------------------------------------------------
  const propRows = new Map<string, NamedRow>();
  for (const r of selected) for (const p of r.props) propRows.set(p.name.toLowerCase(), { name: p.name });
  const propIds = await ensureByName("props", propRows, report.props);

  // ---- Tasks --------------------------------------------------------------
  const { data: existingTasks, error: tErr } = await db.from("tasks").select("id, import_key");
  if (tErr) throw tErr;
  const taskIds = new Map(existingTasks.filter((t) => t.import_key).map((t) => [t.import_key!, t.id]));

  for (const r of selected) {
    const sid = await sceneId(r.venue, r.scene, r.sceneDescription);
    if (taskIds.has(r.key)) {
      report.tasks.existing++;
      continue;
    }
    const comments = r.comments.join(" · ");
    let status: TaskStatusValue = inferStatus({ done: r.done, inReadySheet: readyKeys.has(r.key), comments });
    if (status === "proposed" && /needs? to change/i.test(comments)) status = "needs_change";
    const iteration = extractIteration(r.notes);
    const keepNote = r.notes && !(iteration || (mentionsIteration(r.notes) && !r.notes.split(":")[1]?.trim()));

    const { data: task, error } = await db
      .from("tasks")
      .insert({
        scene_id: sid,
        instruction: r.instruction,
        status,
        arms_required: armsRequired(r.instruction),
        target_episodes: status === "done" ? syntheticTarget(r.key) : 50,
        feasibility_notes: comments || null,
        notes: keepNote ? r.notes : null,
        import_key: r.key,
        version_change_reason: `Imported from spreadsheet (${r.sheet} row ${r.row})`,
        tags: r.venue.toLowerCase().includes("office") ? ["office"] : ["showroom"],
      })
      .select("id")
      .single();
    if (error) throw new Error(`Task "${r.instruction}": ${error.message}`);
    taskIds.set(r.key, task.id);
    report.tasks.created++;

    if (iteration) {
      const { error: vErr } = await db
        .from("tasks")
        .update({ instruction: iteration.instruction, version_change_reason: iteration.reason })
        .eq("id", task.id);
      if (vErr) throw vErr;
      report.tasks.versioned++;
    }

    if (r.props.length) {
      const { error: pErr } = await db.from("task_props").insert(
        r.props.map((p) => ({
          task_id: task.id,
          prop_id: propIds.get(p.name.toLowerCase())!,
          qty: p.qty,
          source: p.source,
        })),
      );
      if (pErr) throw pErr;
    }
  }

  // ---- Photos -------------------------------------------------------------
  if (PHOTOS) {
    const { data: existingPhotos } = await db.from("scene_photos").select("content_hash");
    const seenHashes = new Set((existingPhotos ?? []).map((p) => p.content_hash));
    const rowsBySheet = new Map<string, Row[]>([
      [tasksSheet.name, taskRows],
      [readySheet.name, readyRows],
    ]);

    for (const sheet of [tasksSheet, readySheet]) {
      const rows = rowsBySheet.get(sheet.name)!;
      for (const img of sheet.images) {
        const hash = createHash("sha256").update(img.bytes).digest("hex");
        if (seenHashes.has(hash)) {
          report.photos.skippedExisting++;
          continue;
        }
        // The task row the image is anchored on, or the nearest one above it (same scene).
        const exact = rows.find((r) => r.row === img.row);
        const above = [...rows].reverse().find((r) => r.row <= img.row);
        const owner = exact ?? (above && img.row <= Math.max(...rows.map((r) => r.row)) ? above : undefined);

        let target: { venue: string; scene: string; description: string | null } | null = null;
        if (owner) {
          if (!ALL && !selectedKeys.has(owner.key)) {
            report.photos.skippedNotSelected++;
            continue;
          }
          target = { venue: owner.venue, scene: owner.scene, description: owner.sceneDescription };
        } else if (above) {
          target = { venue: above.venue, scene: "Unsorted", description: null };
        }
        if (!target) continue;

        const sid = await sceneId(target.venue, target.scene, target.description);
        const photo = await processPhoto(Buffer.from(img.bytes));
        const { storagePath, thumbPath } = await storePhoto(db, sid, photo);
        const { error } = await db.from("scene_photos").insert({
          scene_id: sid,
          kind: "reference",
          storage_path: storagePath,
          thumb_path: thumbPath,
          width: photo.width,
          height: photo.height,
          content_hash: hash,
          caption: target.scene === "Unsorted" ? `From ${sheet.name} row ${img.row}` : null,
        });
        if (error) throw error;
        seenHashes.add(hash);
        if (target.scene === "Unsorted") report.photos.unsorted++;
        else report.photos.mapped++;
        process.stdout.write(".");
      }
    }
    process.stdout.write("\n");
  }

  console.log(`\nImport ${ALL ? "(all rows)" : "(demo subset)"}${ANONYMIZE ? " · venue names anonymized" : ""}`);
  console.table({
    venues: report.venues,
    scenes: report.scenes,
    props: report.props,
    tasks: report.tasks,
  });
  console.log("photos:", report.photos);
  console.log(
    `rows: ${taskRows.length} (Tasks) + ${readyRows.length} (Ready to Go); duplicates merged: ${report.duplicatesMerged}; ` +
      `blank rows skipped: ${report.blankRowsSkipped}; in-cell images found: ${report.inCellImages}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
