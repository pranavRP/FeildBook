import { NextResponse } from "next/server";
import { rigHandler } from "@/lib/api/rig-auth";

export const dynamic = "force-dynamic";

/** Key check: confirms the key works and which rig it belongs to. */
export const GET = rigHandler(async ({ rig, prefix }) =>
  NextResponse.json({ ok: true, rig, key_prefix: prefix, time: new Date().toISOString() }),
);
