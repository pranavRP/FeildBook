import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["user_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Viewer = {
  id: string;
  email: string;
  profile: Profile;
  role: Role;
};

/** The signed-in user for this request (memoized per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile || !profile.active) return null;

  return {
    id: claims.sub,
    email: profile.email,
    profile,
    role: profile.role,
  };
});

/** Use in pages: redirects to /login when signed out, 403 page when role is not allowed. */
export async function requireViewer(roles?: Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (roles && !roles.includes(viewer.role)) redirect("/?denied=1");
  return viewer;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
  }
}

/** Use in server actions: throws instead of redirecting. */
export async function assertRole(roles: Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new ForbiddenError("Your session has expired. Sign in again.");
  if (!roles.includes(viewer.role)) throw new ForbiddenError();
  return viewer;
}

export const isStaff = (role: Role) => role === "admin" || role === "designer";
