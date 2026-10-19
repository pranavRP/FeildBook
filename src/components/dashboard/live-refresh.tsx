"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Subscribes to episode inserts/deletes over Supabase Realtime (RLS-filtered)
 * and calls `onChange` (debounced) when something happens.
 */
export function useLiveEpisodes(onChange: () => void) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [events, setEvents] = useState(0);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      // Realtime needs the user's JWT so RLS applies to change events.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`dashboard-episodes-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "episodes" }, () => {
          setEvents((n) => n + 1);
          clearTimeout(timer);
          timer = setTimeout(() => callback.current(), 300);
        })
        .subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CLOSED" || s === "CHANNEL_ERROR" ? "offline" : "connecting"));
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { status, events };
}

export function LiveBadge({ status, events }: { status: LiveStatus; events: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium"
      title="Updates as episodes are logged"
      data-testid="live-indicator"
      data-status={status}
      data-events={events}
    >
      <span className="relative flex size-2">
        {status === "live" && (
          <span key={events} className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            status === "live" ? "bg-emerald-500" : status === "offline" ? "bg-rose-500" : "bg-amber-400",
          )}
        />
      </span>
      {status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting"}
    </span>
  );
}
