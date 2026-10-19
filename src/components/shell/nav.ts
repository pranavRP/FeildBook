import {
  ClipboardList,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon; roles?: Role[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", short: "Tasks", icon: ClipboardList },
  { href: "/venues", label: "Venues & Scenes", short: "Venues", icon: MapPin },
  { href: "/shopping", label: "Shopping List", short: "Shop", icon: ShoppingCart },
  { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

export const ADMIN_LINKS = [
  { href: "/admin", label: "Users" },
  { href: "/admin/rigs", label: "Rigs & API keys" },
  { href: "/admin/audit", label: "Audit log" },
];

export function navFor(role: Role) {
  return NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

