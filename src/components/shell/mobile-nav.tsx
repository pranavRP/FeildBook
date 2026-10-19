"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";
import { isActive, navFor } from "./nav";

/** Bottom tab bar for phones and small tablets. */
export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navFor(role).filter((i) => i.href !== "/admin");
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                <item.icon className="size-5" />
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
