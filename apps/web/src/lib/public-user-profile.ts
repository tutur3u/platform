import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export type PublicUserProfile = {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
};

export function publicProfileImage(value: string | null): string | undefined {
  try {
    const url = value ? new URL(value) : null;
    return url?.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

// Never expand this projection from the current-user or workspace profile DTO.
export async function readPublicUserProfile(
  username: string
): Promise<PublicUserProfile | null> {
  if (!/^[a-zA-Z0-9_]{1,100}$/.test(username)) return null;
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('users')
    .select('display_name,avatar_url,banner_url,bio')
    .eq('handle', username.toLowerCase())
    .maybeSingle();
  if (error) throw new Error('Unable to read public profile');
  if (!data) return null;
  return {
    display_name: data.display_name,
    bio: data.bio,
    avatar_url: data.avatar_url,
    banner_url: data.banner_url,
  };
}
