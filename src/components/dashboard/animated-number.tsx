"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Counts from the previous value to the new one and briefly highlights the change. */
export function AnimatedNumber({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    from.current = value;
    setFlash(true);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const off = setTimeout(() => setFlash(false), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(off);
    };
  }, [value]);

  return (
    <span className={cn("rounded tabular transition-colors duration-700", flash && "bg-primary/10 text-primary", className)}>
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}
