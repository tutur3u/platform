const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_PUBLIC_AVATAR_PATH = '/storage/v1/object/public/avatars/';
const SUPABASE_MALFORMED_PUBLIC_AVATAR_PATH =
  '/storage/v1/object/v1/public/avatars/';

function getSupabasePublicAvatarObjectPath(pathname: string) {
  if (pathname.startsWith(SUPABASE_PUBLIC_AVATAR_PATH)) {
    return pathname.slice(SUPABASE_PUBLIC_AVATAR_PATH.length);
  }

  if (pathname.startsWith(SUPABASE_MALFORMED_PUBLIC_AVATAR_PATH)) {
    return pathname.slice(SUPABASE_MALFORMED_PUBLIC_AVATAR_PATH.length);
  }

  return null;
}

function normalizeSupabasePublicAvatarUrl(src: string) {
  try {
    const sourceUrl = new URL(src);
    const avatarObjectPath = getSupabasePublicAvatarObjectPath(
      sourceUrl.pathname
    );

    if (
      !sourceUrl.hostname.endsWith('.supabase.co') ||
      avatarObjectPath === null
    ) {
      return src;
    }

    sourceUrl.pathname = `${SUPABASE_PUBLIC_AVATAR_PATH}${avatarObjectPath}`;

    return sourceUrl.toString();
  } catch {
    return src;
  }
}

export function normalizeAvatarImageSrc(
  value: string | null | undefined
): string | undefined {
  const src = value?.trim();

  if (!src || src.startsWith('//') || UUID_PATTERN.test(src)) {
    return undefined;
  }

  if (/^https?:\/\//iu.test(src)) {
    return normalizeSupabasePublicAvatarUrl(src);
  }

  if (
    src.startsWith('/') ||
    src.startsWith('blob:') ||
    /^data:image\//iu.test(src) ||
    src.startsWith('avatars/')
  ) {
    return src;
  }

  return undefined;
}
