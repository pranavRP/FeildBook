"use server";

import { getViewer } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

/** Fresh dashboard numbers for the live view (called on Realtime events). */
export async function refreshDashboard() {
  if (!(await getViewer())) return null;
  return getDashboardData();
}
