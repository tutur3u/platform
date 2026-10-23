import { avatarStorageOrigins } from '@tuturuuu/utils/avatar-storage-origins';
import { bannerStorageOrigin } from './profile-banner-lifecycle';

const ticketFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Match raw bytes so URL normalization cannot hide traversal or encoding. */
export function ownedAvatarPath(value: string, actor: string, origin: string) {
  const prefix = `${origin}/storage/v1/object/public/avatars/${actor}/`;
  if (!value.startsWith(prefix)) return null;
  const filename = value.slice(prefix.length);
  return filename.length === 41 && ticketFilename.test(filename)
    ? `${actor}/${filename}`
    : null;
}

function profileAvatarStorageOrigins() {
  return avatarStorageOrigins([
    bannerStorageOrigin(),
    process.env.SUPABASE_SERVER_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ]);
}

export function ownedProfileAvatarPath(value: string, actor: string) {
  for (const origin of profileAvatarStorageOrigins()) {
    const path = ownedAvatarPath(value, actor, origin);
    if (path) return path;
  }
  return null;
}

export function allowedProfileAvatar(value: string | null, actor: string) {
  if (value === null) return true;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const origins = profileAvatarStorageOrigins();
  if (!origins.includes(url.origin)) return true;
  return origins.some(
    (origin) => ownedAvatarPath(value, actor, origin) !== null
  );
}
