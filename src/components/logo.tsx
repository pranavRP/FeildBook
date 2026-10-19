import { cn } from "@/lib/utils";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Fieldbook";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path d="M5 4h9a5 5 0 0 1 5 5v11H10a5 5 0 0 1-5-5V4Z" strokeLinejoin="round" />
        <path d="M9 9h6M9 13h4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>{appName}</span>
    </span>
  );
}
