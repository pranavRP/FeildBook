import { cn } from "@/lib/utils";

export function TaskProgress({
  success,
  target,
  className,
  showLabel = true,
}: {
  success: number;
  target: number;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (success / target) * 100) : 0;
  const done = success >= target;
  return (
    <div className={cn("flex min-w-28 items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={success}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label="Successful episodes"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", done ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-14 text-right text-xs text-muted-foreground tabular">
          {success}/{target}
        </span>
      )}
    </div>
  );
}
