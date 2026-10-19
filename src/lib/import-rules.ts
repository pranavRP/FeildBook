/**
 * Pure rules for turning spreadsheet rows into structured records.
 * Kept free of I/O so they can be unit-tested.
 */

export type TaskStatusValue =
  | "proposed"
  | "feasibility_test"
  | "feasible"
  | "needs_change"
  | "infeasible"
  | "ready"
  | "collecting"
  | "done";

/** Lowercase, trim, collapse whitespace, drop trailing punctuation. Used for dedupe. */
export function normalizeInstruction(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
}

/** Tidies an instruction for display: trims, collapses spaces, capitalises the first letter. */
export function cleanInstruction(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Storage room metal shelving 01: red bins, …" -> "Storage room metal shelving 01" */
export function sceneNameFrom(description: string): string {
  const head = description.split(":")[0].trim();
  const name = head.length > 0 && head.length <= 80 ? head : description.slice(0, 60).trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function armsRequired(instruction: string): 1 | 2 {
  return /\b(both|two) hands\b/i.test(instruction) ? 2 : 1;
}

export type ParsedProp = { name: string; qty: number; source: "at_scene" | "to_buy" };

/** Splits on commas that are not inside parentheses. */
function splitItems(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

/**
 * "Scene: cardboard box | Buy: tape dispenser, 3 cups" ->
 *   [{cardboard box, at_scene}, {tape dispenser, to_buy}, {cups ×3, to_buy}]
 * Segments without a prefix are treated as already at the scene.
 */
export function parseProps(cell: string | null | undefined): ParsedProp[] {
  if (!cell?.trim()) return [];
  const seen = new Map<string, ParsedProp>();
  for (const segment of cell.split("|")) {
    let text = segment.trim();
    let source: ParsedProp["source"] = "at_scene";
    const prefix = /^(scene|buy)\s*:\s*/i.exec(text);
    if (prefix) {
      source = prefix[1].toLowerCase() === "buy" ? "to_buy" : "at_scene";
      text = text.slice(prefix[0].length);
    }
    for (const raw of splitItems(text)) {
      let item = raw.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
      if (!item) continue;
      let qty = 1;
      const q = /^(\d{1,2})\s+(?!-)(.+)$/.exec(item);
      if (q && !/^\d+\s*(mm|cm|in|g|kg)\b/i.test(item)) {
        qty = Number(q[1]);
        item = q[2];
      }
      const name = item.charAt(0).toUpperCase() + item.slice(1);
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name, qty, source });
    }
  }
  return [...seen.values()];
}

/** Picks the status for an imported row. Order matters: Done > Ready to Go > comments. */
export function inferStatus(opts: {
  done: boolean;
  inReadySheet: boolean;
  comments: string;
}): TaskStatusValue {
  if (opts.done) return "done";
  if (opts.inReadySheet) return "ready";
  const c = opts.comments.toLowerCase();
  if (/\b(impossible|infeasible)\b/.test(c)) return "infeasible";
  if (/concern|needs testing/.test(c)) return "feasibility_test";
  return "proposed";
}

const IMPERATIVE_VERBS = new Set(
  (
    "put place take open close unplug plug wrap coil fold move set stack pull push insert remove lift " +
    "pour hang stand sort turn slide drop grab press wipe tape peel nest line clip carry gather"
  ).split(" "),
);

export type Iteration = { instruction: string; reason: string };

/**
 * Detects "NEW ITERATION: <new instruction>" style notes. Returns the replacement
 * instruction only when the note clearly is one (starts with an imperative verb);
 * otherwise null, and the note stays in `notes`.
 */
export function extractIteration(note: string | null | undefined): Iteration | null {
  if (!note) return null;
  const m = /new iteration(?:\s*\(replaced\))?\s*:\s*([\s\S]*)$/i.exec(note) ?? /replaced\s*:\s*([\s\S]*)$/i.exec(note);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, " ").trim();
  if (text.length < 10 || /^\W+$/.test(text)) return null;
  const firstWord = text.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!IMPERATIVE_VERBS.has(firstWord)) return null;
  return { instruction: cleanInstruction(text), reason: note.replace(/\s+/g, " ").trim() };
}

export function mentionsIteration(note: string | null | undefined): boolean {
  return !!note && /new iteration|replaced/i.test(note);
}

/** Maps real venue names to neutral ones ("Office Site A", "Showroom B", "Venue C", …). */
export function createVenueAnonymizer(enabled: boolean) {
  const map = new Map<string, string>();
  const used = new Set<string>();
  let letter = 2; // "C"
  return (name: string) => {
    if (!enabled) return name;
    const key = name.trim().toLowerCase();
    let label = map.get(key);
    if (!label) {
      const preferred = /appliance|showroom|store/i.test(name)
        ? "Showroom B"
        : /office/i.test(name)
          ? "Office Site A"
          : null;
      label = preferred && !used.has(preferred) ? preferred : `Venue ${String.fromCharCode(65 + letter++)}`;
      map.set(key, label);
      used.add(label);
    }
    return label;
  };
}
