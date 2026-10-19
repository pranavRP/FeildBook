import "server-only";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/auth";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Postgres/PostgREST error -> message safe to show users. */
export function dbErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "42501":
      return "You do not have permission to do that.";
    case "23505":
      return "That already exists.";
    case "23503":
      return "It is still referenced by other records.";
    case "22023":
    case "P0002":
      return error.message;
    default:
      console.error("[db]", error);
      return "Something went wrong. Please try again.";
  }
}

export class ActionError extends Error {}

/** Runs a server action body and converts thrown errors into an ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof ActionError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input." };
    if (err && typeof err === "object" && "message" in err && ("code" in err || "details" in err)) {
      return { ok: false, error: dbErrorMessage(err as { code?: string; message: string }) };
    }
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Unwraps a Supabase response, throwing its error. */
export function must<T>(res: { data: T; error: { code?: string; message: string } | null }): NonNullable<T> {
  if (res.error) throw res.error;
  if (res.data === null || res.data === undefined) throw new ActionError("Not found.");
  return res.data;
}

/** Throws a Supabase response's error; for calls with no meaningful data (void RPCs). */
export function check(res: { error: { code?: string; message: string } | null }): void {
  if (res.error) throw res.error;
}
