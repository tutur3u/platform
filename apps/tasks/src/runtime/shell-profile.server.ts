import '@tanstack/react-start/server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

/**
 * The signed-in actor's profile for the workspace shell (user menu), read
 * directly for the verified actor id. It is the same row pair the central
 * `/api/v1/users/me/profile` route returns, without a cross-app request on
 * every page load and navigation.
 */
export async function readShellProfile(user: {
  id: string;
  email?: string | null;
}): Promise<WorkspaceUser> {
  const fallback: WorkspaceUser = {
    id: user.id,
    email: user.email ?? undefined,
  };
  try {
    const admin = await createAdminClient({ noCookie: true });
    const [profileResult, detailsResult] = await Promise.all([
      admin
        .from('users')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle(),
      admin
        .from('user_private_details')
        .select('full_name, new_email, email, default_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (profileResult.error || detailsResult.error) return fallback;
    const profile = profileResult.data;
    const details = detailsResult.data;
    return {
      avatar_url: profile?.avatar_url ?? null,
      created_at: profile?.created_at ?? null,
      default_workspace_id: details?.default_workspace_id ?? null,
      display_name: profile?.display_name ?? null,
      email: details?.email ?? user.email ?? undefined,
      full_name: details?.full_name ?? null,
      id: user.id,
      name: profile?.display_name ?? details?.full_name ?? undefined,
      new_email: details?.new_email ?? null,
    };
  } catch (error) {
    console.warn('Shell profile read failed', error);
    return fallback;
  }
}
