import { createHash, randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "scene-photos";
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif", "tiff"]);

export class PhotoError extends Error {}

export type ProcessedPhoto = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  contentHash: string;
};

/**
 * Re-encodes an uploaded image. sharp drops all metadata (EXIF, GPS, XMP) unless
 * asked to keep it, so the stored bytes never carry the capture location.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.byteLength === 0) throw new PhotoError("Empty file.");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new PhotoError("Image is larger than 15 MB.");

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new PhotoError("File is not a readable image.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new PhotoError(`Unsupported image type (${meta.format ?? "unknown"}).`);
  }

  const base = sharp(input, { limitInputPixels: 80_000_000 }).rotate(); // apply EXIF orientation, then strip
  const { data: full, info } = await base
    .clone()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: 400, height: 300, fit: "cover", position: "attention" })
    .webp({ quality: 75 })
    .toBuffer();

  return {
    full,
    thumb,
    width: info.width,
    height: info.height,
    contentHash: createHash("sha256").update(input).digest("hex"),
  };
}

/** Uploads processed bytes to the private bucket. Caller must have checked permissions. */
export async function storePhoto(admin: SupabaseClient, sceneId: string, photo: ProcessedPhoto) {
  const id = randomUUID();
  const storagePath = `${sceneId}/${id}.jpg`;
  const thumbPath = `${sceneId}/${id}_thumb.webp`;
  const bucket = admin.storage.from(PHOTO_BUCKET);

  const up1 = await bucket.upload(storagePath, photo.full, { contentType: "image/jpeg", upsert: false });
  if (up1.error) throw new Error(`Storage upload failed: ${up1.error.message}`);
  const up2 = await bucket.upload(thumbPath, photo.thumb, { contentType: "image/webp", upsert: false });
  if (up2.error) {
    await bucket.remove([storagePath]);
    throw new Error(`Storage upload failed: ${up2.error.message}`);
  }
  return { storagePath, thumbPath };
}
