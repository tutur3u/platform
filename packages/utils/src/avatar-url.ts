const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_PUBLIC_AVATAR_PATH = '/storage/v1/object/public/avatars/';

function normalizeSupabasePublicAvatarUrl(src: string) {
  const currentSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!currentSupabaseUrl) {
    return src;
  }

  try {
    const sourceUrl = new URL(src);

    if (
      !sourceUrl.hostname.endsWith('.supabase.co') ||
      !sourceUrl.pathname.startsWith(SUPABASE_PUBLIC_AVATAR_PATH)
    ) {
      return src;
    }

    const currentUrl = new URL(currentSupabaseUrl);
    currentUrl.pathname = sourceUrl.pathname;
    currentUrl.search = sourceUrl.search;
    currentUrl.hash = sourceUrl.hash;

    return currentUrl.toString();
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

  if (
    /^https?:\/\//iu.test(src)
  ) {
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
