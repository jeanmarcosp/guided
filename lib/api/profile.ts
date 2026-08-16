import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

// Profile avatar image storage (see supabase/migrations/0013_avatars.sql).
// Objects live at `{userId}/avatar` in the public `avatars` bucket; RLS confines
// writes to the user's own folder. The image picker hands us base64 JPEG data
// regardless of the source format, so we always upload image/jpeg.

const AVATAR_BUCKET = 'avatars';
const avatarPath = (userId: string) => `${userId}/avatar`;

/** Upload a JPEG avatar (base64 from expo-image-picker) and return its public URL. */
export async function uploadAvatar(userId: string, base64: string): Promise<string> {
  const path = avatarPath(userId);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // The path is stable, so bust the CDN/image cache with the upload time —
  // otherwise a re-upload keeps showing the previous picture.
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Delete the user's uploaded avatar file. Best-effort — a missing file is fine. */
export async function deleteAvatar(userId: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(userId)]);
  if (error) console.warn('[avatar] delete failed:', error.message);
}
