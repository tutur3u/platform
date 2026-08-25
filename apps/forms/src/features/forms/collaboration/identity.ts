import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { FormCollaboratorIdentity } from './channel';

/**
 * Resolves the collaborator identity handed to the studio.
 *
 * Done on the server from the app session, because registered satellites must
 * not read Supabase auth in the browser — the `internal-app-auth` guard
 * enforces that, and `NotificationPopover` already takes a server-resolved
 * `userId` the same way.
 *
 * The app-session user carries only an id and email, so the display name and
 * avatar are read from `public.users` through the admin client the caller
 * already holds. A missing profile row is not an error: presence falls back to
 * the email local part, which is still recognisable to teammates.
 */
export async function resolveCollaboratorIdentity({
  adminClient,
  user,
}: {
  adminClient: TypedSupabaseClient;
  user: { id: string; email?: string | null } | null | undefined;
}): Promise<FormCollaboratorIdentity | null> {
  if (!user?.id) {
    return null;
  }

  const { data: profile } = await adminClient
    .from('users')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const email = user.email ?? null;
  const displayName =
    profile?.display_name?.trim() || email?.split('@')[0] || 'Teammate';

  return {
    id: user.id,
    displayName,
    email,
    avatarUrl: profile?.avatar_url ?? null,
  };
}
