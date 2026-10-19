import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, PHOTO_BUCKET, PhotoError, processPhoto, storePhoto } from "@/lib/photos";
import { photoKinds } from "@/lib/validation";

export const runtime = "nodejs";

const fieldsSchema = z.object({
  scene_id: z.uuid(),
  kind: z.enum(photoKinds).default("reference"),
  caption: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});

const ALLOWED_TYPES = /^image\/(jpeg|png|webp|heic|heif|avif)$/;
const MAX_FILES = 10;

/**
 * Scene photo upload. Every image is re-encoded with sharp (strips EXIF/GPS) and
 * a thumbnail is generated. The DB row is inserted as the signed-in user, so RLS
 * decides whether this user may add photos to this scene.
 */
export async function POST(request: NextRequest) {
  // Cookie-authenticated endpoint: reject cross-site form posts.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.role === "viewer") {
    return NextResponse.json({ error: "You cannot upload photos." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const fields = fieldsSchema.safeParse({
    scene_id: form.get("scene_id"),
    kind: form.get("kind") || undefined,
    caption: form.get("caption") || undefined,
  });
  if (!fields.success) return NextResponse.json({ error: "Invalid fields." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files.` }, { status: 400 });

  const supabase = await createClient();
  const { data: scene } = await supabase.from("scenes").select("id").eq("id", fields.data.scene_id).maybeSingle();
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  const admin = createAdminClient();
  const created: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push({ name: file.name, error: "Larger than 15 MB." });
      continue;
    }
    if (file.type && !ALLOWED_TYPES.test(file.type)) {
      errors.push({ name: file.name, error: "Not an image." });
      continue;
    }
    try {
      const photo = await processPhoto(Buffer.from(await file.arrayBuffer()));
      const { storagePath, thumbPath } = await storePhoto(admin, scene.id, photo);
      const { data, error } = await supabase
        .from("scene_photos")
        .insert({
          scene_id: scene.id,
          kind: fields.data.kind,
          caption: fields.data.caption,
          storage_path: storagePath,
          thumb_path: thumbPath,
          width: photo.width,
          height: photo.height,
          content_hash: photo.contentHash,
          uploaded_by: viewer.id,
        })
        .select("id")
        .single();
      if (error) {
        await admin.storage.from(PHOTO_BUCKET).remove([storagePath, thumbPath]);
        if (error.code === "42501") {
          return NextResponse.json({ error: "You cannot add photos to this scene." }, { status: 403 });
        }
        errors.push({ name: file.name, error: error.code === "23505" ? "Already uploaded." : "Could not save." });
        continue;
      }
      created.push(data.id);
    } catch (err) {
      errors.push({ name: file.name, error: err instanceof PhotoError ? err.message : "Could not process image." });
      if (!(err instanceof PhotoError)) console.error("[upload]", err);
    }
  }

  return NextResponse.json({ created, errors }, { status: created.length ? 201 : 422 });
}
