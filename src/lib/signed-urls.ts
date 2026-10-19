import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photos";

export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Signs storage paths for display. Callers must pass only paths they obtained
 * through an RLS-checked query as the signed-in user; signing itself uses the
 * service role because the bucket has no client policies.
 */
export async function signPaths(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data } = await createAdminClient()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}

export type SignedPhoto = {
  id: string;
  kind: string;
  caption: string | null;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
};

export async function signPhotos<
  T extends {
    id: string;
    kind: string;
    caption: string | null;
    storage_path: string;
    thumb_path: string;
    width: number | null;
    height: number | null;
  },
>(photos: T[]): Promise<SignedPhoto[]> {
  const urls = await signPaths(photos.flatMap((p) => [p.storage_path, p.thumb_path]));
  return photos.flatMap((p) => {
    const url = urls.get(p.storage_path);
    const thumbUrl = urls.get(p.thumb_path);
    if (!url || !thumbUrl) return [];
    return [{ id: p.id, kind: p.kind, caption: p.caption, url, thumbUrl, width: p.width, height: p.height }];
  });
}
