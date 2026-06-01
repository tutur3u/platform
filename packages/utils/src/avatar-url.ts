const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSupabasePublicBareUuidAvatarUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/u, '');
    const prefix = '/storage/v1/object/public/avatars/';

    if (!path.startsWith(prefix)) {
      return false;
    }

    const objectPath = path.slice(prefix.length);
    return UUID_PATTERN.test(objectPath);
  } catch {
    return false;
  }
}

export function normalizeAvatarImageSrc(
  value: string | null | undefined
): string | undefined {
  const src = value?.trim();

  if (!src || src.startsWith('//') || UUID_PATTERN.test(src)) {
    return undefined;
  }

  if (isSupabasePublicBareUuidAvatarUrl(src)) {
    return undefined;
  }

  if (
    /^https?:\/\//iu.test(src) ||
    src.startsWith('/') ||
    src.startsWith('blob:') ||
    /^data:image\//iu.test(src) ||
    src.startsWith('avatars/')
  ) {
    return src;
  }

  return undefined;
}
