import { NextResponse, type NextRequest } from "next/server";
import { getViewer, isStaff } from "@/lib/auth";
import { queryTasks } from "@/lib/task-query";
import { taskFiltersSchema } from "@/lib/validation";

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaff(viewer.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = taskFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const tasks = await queryTasks(filters, 5000);
  const header = [
    "code", "instruction", "status", "venue", "scene", "priority", "arms_required", "difficulty",
    "success_count", "episode_count", "target_episodes", "tags", "updated_at",
  ];
  const lines = tasks.map((t) =>
    [
      t.code, t.instruction, t.status, t.scenes.venues?.name, t.scenes.name, t.priority, t.arms_required,
      t.difficulty, t.success_count, t.episode_count, t.target_episodes, t.tags, t.updated_at,
    ]
      .map(cell)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tasks-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
