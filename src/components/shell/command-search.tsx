"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, MapPin, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { globalSearch, type SearchHit } from "@/app/(app)/search-action";

/** Global search palette. Opens with "/" or Cmd/Ctrl+K. */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!query.trim()) return setHits([]);
    const t = setTimeout(() => startTransition(async () => setHits(await globalSearch(query))), 150);
    return () => clearTimeout(t);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const tasks = hits.filter((h) => h.kind === "task");
  const scenes = hits.filter((h) => h.kind === "scene");

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full justify-start gap-2 text-muted-foreground sm:w-72"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left font-normal">Search tasks & scenes…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">/</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search tasks and scenes">
        <CommandInput placeholder="Type a task, code (T-0012) or scene…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{pending ? "Searching…" : query ? "No results." : "Start typing to search."}</CommandEmpty>
          {tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {tasks.map((h) => (
                <CommandItem key={h.id} value={`${h.title} ${h.subtitle}`} onSelect={() => go(h.href)}>
                  <ClipboardList />
                  <div className="min-w-0">
                    <div className="truncate">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {scenes.length > 0 && (
            <CommandGroup heading="Scenes">
              {scenes.map((h) => (
                <CommandItem key={h.id} value={`${h.title} ${h.subtitle}`} onSelect={() => go(h.href)}>
                  <MapPin />
                  <div className="min-w-0">
                    <div className="truncate">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
