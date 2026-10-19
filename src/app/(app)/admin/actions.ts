"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, must, runAction } from "@/lib/actions";
import { generateApiKey } from "@/lib/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";

const roleSchema = z.enum(["admin", "designer", "operator", "viewer"]);

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72)
  .regex(/[A-Za-z]/, "Password needs a letter.")
  .regex(/\d/, "Password needs a number.");

const createSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  full_name: z.string().trim().min(1, "Name is required").max(120),
  role: roleSchema,
  is_contractor: z.boolean().default(false),
  venue_ids: z.array(uuid).max(100).default([]),
  password: passwordSchema,
});

/** Creates an account with a starting password. Role travels in app_metadata (server-only). */
export async function createUser(input: unknown) {
  return runAction(async () => {
    await assertRole(["admin"]);
    const values = createSchema.parse(input);
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email: values.email,
      password: values.password,
      email_confirm: true,
      user_metadata: { full_name: values.full_name },
      app_metadata: { role: values.role, is_contractor: values.is_contractor },
    });
    if (error) {
      throw new ActionError(/already/i.test(error.message) ? "That email already has an account." : error.message);
    }
    if (values.venue_ids.length) {
      const supabase = await createClient();
      check(
        await supabase
          .from("venue_assignments")
          .insert(values.venue_ids.map((venue_id) => ({ venue_id, user_id: data.user.id }))),
      );
    }
    revalidatePath("/admin");
  });
}

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  role: roleSchema,
  is_contractor: z.boolean(),
  venue_ids: z.array(uuid).max(100),
  new_password: z.union([z.literal(""), passwordSchema]).optional(),
});

export async function updateUser(id: string, input: unknown) {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    const userId = uuid.parse(id);
    const values = updateSchema.parse(input);
    if (userId === me.id && values.role !== "admin") throw new ActionError("You can't remove your own admin role.");
    const supabase = await createClient();
    must(
      await supabase
        .from("profiles")
        .update({ full_name: values.full_name, role: values.role, is_contractor: values.is_contractor })
        .eq("id", userId)
        .select("id")
        .single(),
    );
    // Keep auth app_metadata in sync (profiles.role is what RLS uses), and set a new password if given.
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, {
      app_metadata: { role: values.role, is_contractor: values.is_contractor },
      ...(values.new_password ? { password: values.new_password } : {}),
    });
    if (authError) throw new ActionError(authError.message);
    // Replace venue assignments.
    const { data: current } = await supabase.from("venue_assignments").select("venue_id").eq("user_id", userId);
    const have = new Set((current ?? []).map((r) => r.venue_id));
    const want = new Set(values.venue_ids);
    const remove = [...have].filter((v) => !want.has(v));
    const add = [...want].filter((v) => !have.has(v));
    if (remove.length) check(await supabase.from("venue_assignments").delete().eq("user_id", userId).in("venue_id", remove));
    if (add.length) {
      check(await supabase.from("venue_assignments").insert(add.map((venue_id) => ({ venue_id, user_id: userId }))));
    }
    revalidatePath("/admin");
  });
}

/** Deactivation takes effect immediately: profile inactive (RLS + middleware), auth ban, sessions revoked. */
export async function setUserActive(id: string, active: boolean) {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    const userId = uuid.parse(id);
    if (userId === me.id && !active) throw new ActionError("You can't deactivate yourself.");
    const supabase = await createClient();
    must(await supabase.from("profiles").update({ active }).eq("id", userId).select("id").single());
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: active ? "none" : "876000h",
    });
    if (error) throw new ActionError(`Profile updated, but the auth ban failed: ${error.message}`);
    if (!active) check(await supabase.rpc("admin_revoke_sessions", { p_user_id: userId }));
    revalidatePath("/admin");
  });
}

// ---------------------------------------------------------------------------
// Rigs & API keys
// ---------------------------------------------------------------------------
const rigSchema = z.object({
  name: z.string().trim().min(1).max(60),
  arm_model: z.string().trim().max(120).nullable().default(null),
  headset: z.string().trim().max(120).nullable().default(null),
  arms: z.coerce.number().int().min(1).max(2),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export async function saveRig(id: string | null, input: unknown) {
  return runAction(async () => {
    await assertRole(["admin"]);
    const values = rigSchema.parse(input);
    const supabase = await createClient();
    if (id) must(await supabase.from("rigs").update(values).eq("id", uuid.parse(id)).select("id").single());
    else must(await supabase.from("rigs").insert(values).select("id").single());
    revalidatePath("/admin/rigs");
  });
}

/** Creates a key and returns the plaintext once. Only the sha256 hash is stored. */
export async function createApiKey(rigId: string, label: string | null) {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    const { key, prefix, hash } = generateApiKey();
    const supabase = await createClient();
    must(
      await supabase
        .from("api_keys")
        .insert({
          rig_id: uuid.parse(rigId),
          prefix,
          key_hash: hash,
          label: z.string().trim().max(60).nullable().parse(label) || null,
          created_by: me.id,
        })
        .select("id")
        .single(),
    );
    revalidatePath("/admin/rigs");
    return key;
  });
}

export async function revokeApiKey(id: string) {
  return runAction(async () => {
    await assertRole(["admin"]);
    const supabase = await createClient();
    must(
      await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", uuid.parse(id))
        .is("revoked_at", null)
        .select("id")
        .single(),
    );
    revalidatePath("/admin/rigs");
  });
}
