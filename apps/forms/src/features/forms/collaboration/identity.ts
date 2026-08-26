import 'server-only';

import { getSatelliteSupabaseSessionUser } from '@tuturuuu/satellite/auth';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { FormCollaboratorIdentity } from './channel';

/**
 * Whether this request's browser will be able to join a private Realtime
 * channel.
 *
 * `getSatelliteAppSessionUser` resolves an actor from either an app-session
 * token or a Supabase session. Only the second leaves the browser with Supabase
 * auth cookies, and the browser Realtime client authenticates from those — so
 * on the app-session path the client connects as `anon` and both
 * `realtime.messages` policies, which are `to authenticated`, refuse the topic.
 *
 * Resolved on the server because a registered satellite must not call
 * `supabase.auth.*` in the browser, so the client cannot check for itself.
 * Without this the studio subscribes, is silently refused, and shows an empty
 * collaborator list that looks exactly like "nobody else is here".
 */
export async function canJoinFormRealtime(): Promise<boolean> {
  const supabaseUser = await getSatelliteSupabaseSessionUser();
  return Boolean(supabaseUser?.id);
}

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
