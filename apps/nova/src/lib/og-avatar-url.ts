const PUBLIC_AVATAR_PATH = '/storage/v1/object/public/avatars/';

function isSupabaseProjectHostname(hostname: string) {
  if (!hostname.endsWith('.supabase.co')) return false;

  const projectLabel = hostname.slice(0, -'.supabase.co'.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(projectLabel);
}

export function getNovaOgAvatarUrl(
  value: string | null | undefined
): string | null {
  if (!value || value !== value.trim()) return null;

  try {
    const url = new URL(value);
    const objectPath = url.pathname.slice(PUBLIC_AVATAR_PATH.length);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !isSupabaseProjectHostname(url.hostname) ||
      !url.pathname.startsWith(PUBLIC_AVATAR_PATH) ||
      !/[^/]/u.test(objectPath) ||
      url.pathname.includes('%')
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}
