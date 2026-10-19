/**
 * Minimal .xlsx reader: cell values plus embedded images mapped to their anchor rows.
 * (No third-party spreadsheet library: the widely used one is unmaintained on npm.)
 */
import { unzipSync, strFromU8 } from "fflate";
import { posix as path } from "node:path";

export type SheetRow = { row: number; cells: Record<string, string> };
export type SheetImage = { row: number; col: number; media: string; bytes: Uint8Array };
export type Sheet = { name: string; rows: SheetRow[]; images: SheetImage[] };

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

function relsFor(files: Record<string, Uint8Array>, part: string): Map<string, string> {
  const relPath = path.join(path.dirname(part), "_rels", `${path.basename(part)}.rels`);
  const out = new Map<string, string>();
  const xml = files[relPath] && strFromU8(files[relPath]);
  if (!xml) return out;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) {
      out.set(id, target.startsWith("/") ? target.slice(1) : path.normalize(path.join(path.dirname(part), target)));
    }
  }
  return out;
}

export function readWorkbook(buffer: Uint8Array): Sheet[] {
  const files = unzipSync(buffer);
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");

  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const wbRels = relsFor(files, "xl/workbook.xml");

  return [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(attr(m[0], "name") ?? "");
    const rid = attr(m[0], "r:id") ?? "";
    const part = wbRels.get(rid) ?? "";
    const xml = read(part);

    const rows: SheetRow[] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNum = Number(attr(r[1], "r"));
      const cells: Record<string, string> = {};
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r") ?? "";
        const col = ref.replace(/\d+/g, "");
        const type = attr(c[1], "t");
        const body = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: string | undefined;
        if (type === "s" && v !== undefined) value = shared[Number(v)];
        else if (type === "inlineStr") value = textOf(body);
        else if (v !== undefined) value = decode(v);
        if (value !== undefined && value !== "") cells[col] = value;
      }
      rows.push({ row: rowNum, cells });
    }

    // Floating images: sheet -> drawing -> anchors (xdr:from row/col) -> media.
    const images: SheetImage[] = [];
    for (const drawingPart of relsFor(files, part).values()) {
      if (!drawingPart.includes("drawings/")) continue;
      const dRels = relsFor(files, drawingPart);
      const dXml = read(drawingPart);
      for (const a of dXml.matchAll(/<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
        const from = /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(a[0]);
        const embed = /r:embed="([^"]+)"/.exec(a[0])?.[1];
        const media = embed ? dRels.get(embed) : undefined;
        if (from && media && files[media]) {
          images.push({ row: Number(from[2]) + 1, col: Number(from[1]), media, bytes: files[media] });
        }
      }
    }
    return { name, rows, images };
  });
}

/** In-cell images (Excel "Place in cell") live in xl/richData; returns how many exist. */
export function countInCellImages(buffer: Uint8Array): number {
  const files = unzipSync(buffer, { filter: (f) => f.name.startsWith("xl/richData/") });
  const rels = Object.keys(files).find((f) => f.endsWith("richValueRel.xml.rels"));
  return rels ? (strFromU8(files[rels]).match(/<Relationship\b/g) ?? []).length : 0;
}
