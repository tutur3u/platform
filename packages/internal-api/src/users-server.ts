import { createRequestClient } from '@tuturuuu/supabase/request/server';

export type ServerHeaderAccessor = Pick<Headers, 'get'>;

export type CommunityUserProfile = {
  avatar_url: string | null;
  created_at: string | null;
  display_name: string | null;
  handle: string | null;
  id: string;
};

function isCommunityUserProfile(value: unknown): value is CommunityUserProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const row = value as Partial<Record<keyof CommunityUserProfile, unknown>>;

  return (
    typeof row.id === 'string' &&
    (typeof row.handle === 'string' || row.handle === null) &&
    (typeof row.display_name === 'string' || row.display_name === null) &&
    (typeof row.avatar_url === 'string' || row.avatar_url === null) &&
    (typeof row.created_at === 'string' || row.created_at === null)
  );
}

/**
 * Reads the legacy community profile row through the caller's forwarded
 * Supabase auth, preserving the RLS boundary used by the Next.js page.
 */
export async function getCommunityUserProfileByHandle(
  handle: string,
  requestHeaders: ServerHeaderAccessor
): Promise<CommunityUserProfile | null> {
  const normalizedHandle = handle.trim();

  if (!normalizedHandle) {
    return null;
  }

  const supabase = await createRequestClient({
    headers: requestHeaders as Headers,
  });

  const { data: profile, error } = await supabase
    .from('users')
    .select('id,handle,display_name,avatar_url,created_at')
    .eq('handle', normalizedHandle)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return isCommunityUserProfile(profile) ? profile : null;
}
