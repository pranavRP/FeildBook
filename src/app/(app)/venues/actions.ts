"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { must, runAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photos";
import { photoUpdateSchema, sceneSchema, uuid, venueSchema } from "@/lib/validation";

const STAFF = ["admin", "designer"] as const;

export async function saveVenue(id: string | null, input: unknown) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const values = venueSchema.parse(input);
    const supabase = await createClient();
    const row = id
      ? must(await supabase.from("venues").update(values).eq("id", uuid.parse(id)).select("id").single())
      : must(await supabase.from("venues").insert(values).select("id").single());
    revalidatePath("/venues");
    return row.id;
  });
}

export async function saveScene(id: string | null, input: unknown) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const values = sceneSchema.parse(input);
    const supabase = await createClient();
    const row = id
      ? must(await supabase.from("scenes").update(values).eq("id", uuid.parse(id)).select("id").single())
      : must(await supabase.from("scenes").insert(values).select("id").single());
    revalidatePath("/venues");
    revalidatePath(`/venues/scenes/${row.id}`);
    return row.id;
  });
}

export async function setSceneArchived(id: string, archived: boolean) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const supabase = await createClient();
    must(await supabase.from("scenes").update({ archived }).eq("id", uuid.parse(id)).select("id").single());
    revalidatePath("/venues");
  });
}

export async function updatePhoto(input: unknown) {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const { id, ...values } = photoUpdateSchema.parse(input);
    const supabase = await createClient();
    must(await supabase.from("scene_photos").update(values).eq("id", id).select("id").single());
    revalidatePath("/venues", "layout");
  });
}

export async function deletePhoto(id: string) {
  return runAction(async () => {
    await assertRole(["admin", "designer", "operator"]);
    const supabase = await createClient();
    // RLS decides whether this user may delete it (staff, or the uploader in their venue).
    const photo = must(
      await supabase.from("scene_photos").delete().eq("id", uuid.parse(id)).select("storage_path, thumb_path").single(),
    );
    await createAdminClient().storage.from(PHOTO_BUCKET).remove([photo.storage_path, photo.thumb_path]);
    revalidatePath("/venues", "layout");
  });
}
