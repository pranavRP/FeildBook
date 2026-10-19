"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Button } from "@/components/ui/button";

export type DayPoint = { day: string; label: string; success: number; unsuccessful: number };

const SERIES = [
  { key: "success", label: "Successful", color: "var(--series-1)" },
  { key: "unsuccessful", label: "Failed or aborted", color: "var(--series-2)" },
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DayPoint;
  const total = p.success + p.unsuccessful;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: s.color }} />
          {s.label}
          <span className="ml-auto pl-3 font-medium text-foreground tabular">{p[s.key]}</span>
        </div>
      ))}
      <div className="mt-1 border-t pt-1 text-muted-foreground">
        Success rate <span className="font-medium text-foreground tabular">{total ? Math.round((p.success / total) * 100) : 0}%</span>
      </div>
    </div>
  );
}

/** Episodes per day, stacked successful / unsuccessful. One axis, recessive grid. */
export function EpisodesChart({ data }: { data: DayPoint[] }) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setTable((t) => !t)}>
          {table ? "Show chart" : "Show table"}
        </Button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Successful</th>
                <th className="py-1 text-right font-medium">Failed/aborted</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right">{d.success}</td>
                  <td className="py-1 text-right">{d.unsuccessful}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64" role="img" aria-label="Episodes per day for the last 14 days, successful and unsuccessful">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={44}
              />
              <Tooltip content={ChartTooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
              <Bar dataKey="success" stackId="e" fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} radius={0} isAnimationActive={false} />
              <Bar dataKey="unsuccessful" stackId="e" fill="var(--series-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
