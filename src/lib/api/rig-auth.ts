import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { parseApiKey, verifyApiKey } from "@/lib/api-keys";

export type RigContext = {
  keyId: string;
  prefix: string;
  rig: { id: string; name: string; arms: number };
  db: ReturnType<typeof createAdminClient>;
};

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/**
 * Authenticates a rig request: `Authorization: Bearer rig_<prefix>_<secret>`.
 * Returns the rig context or an error response.
 */
export async function authenticateRig(request: Request): Promise<RigContext | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const parsed = parseApiKey(presented);
  if (!parsed) return apiError(401, "unauthorized", "Missing or malformed API key.");

  const db = createAdminClient();
  const { data: key } = await db
    .from("api_keys")
    .select("id, key_hash, last_used_at, revoked_at, rigs(id, name, arms, active)")
    .eq("prefix", parsed.prefix)
    .maybeSingle();

  // Same response for unknown, wrong, revoked or inactive keys.
  if (!key || key.revoked_at || !key.rigs?.active || !verifyApiKey(presented, key.key_hash)) {
    return apiError(401, "unauthorized", "Invalid API key.");
  }

  const { data: allowed, error } = await db.rpc("api_rate_limit_hit", {
    p_key_id: key.id,
    p_limit: serverEnv.apiRateLimitPerMinute,
    p_window_seconds: 60,
  });
  if (error) return apiError(503, "unavailable", "Try again shortly.");
  if (!allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many requests. Slow down." } },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Throttled bookkeeping: at most one write per key per minute.
  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 60_000) {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  }

  return { keyId: key.id, prefix: parsed.prefix, rig: { id: key.rigs.id, name: key.rigs.name, arms: key.rigs.arms }, db };
}

/** Wraps a handler: authenticates, then maps thrown errors to JSON responses. */
export function rigHandler<P = Record<string, never>>(
  fn: (ctx: RigContext, request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    const ctx = await authenticateRig(request);
    if (ctx instanceof NextResponse) return ctx;
    try {
      return await fn(ctx, request, await params);
    } catch (err) {
      if (err instanceof ZodError) {
        return apiError(
          422,
          "validation_failed",
          "Request body is invalid.",
          err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      if (err instanceof SyntaxError) return apiError(400, "bad_json", "Body must be valid JSON.");
      console.error("[api/v1]", err);
      return apiError(500, "internal", "Unexpected error.");
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 64_000) throw new SyntaxError("Body too large");
  return text ? JSON.parse(text) : {};
}
