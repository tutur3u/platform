import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export interface FormsPageContext {
  user: NonNullable<Awaited<ReturnType<typeof getSatelliteAppSessionUser>>>;
  adminClient: TypedSupabaseClient;
  canManageForms: boolean;
  canViewAnalytics: boolean;
}

/**
 * Resolves the actor and forms permissions for a forms dashboard page.
 *
 * Satellite-specific: apps/forms authenticates with a Tuturuuu app-session JWT,
 * so `resolveAuthenticatedSessionUser` on a cookie-backed Supabase client (what
 * apps/web used) resolves an ANONYMOUS client here and every page would 404.
 * Resolve the actor from the app session and run permission RPCs through the
 * admin client with an explicit user id.
 *
 * Returns `null` when there is no app session; callers should `notFound()`.
 */
export async function getFormsPageContext(
  wsId: string
): Promise<FormsPageContext | null> {
  const user = await getSatelliteAppSessionUser('forms');

  if (!user?.id) {
    return null;
  }

  const adminClient = await createAdminClient();

  const [{ data: canManageForms }, { data: canViewAnalytics }] =
    await Promise.all([
      adminClient.rpc('has_workspace_permission', {
        p_permission: 'manage_forms',
        p_user_id: user.id,
        p_ws_id: wsId,
      }),
      adminClient.rpc('has_workspace_permission', {
        p_permission: 'view_form_analytics',
        p_user_id: user.id,
        p_ws_id: wsId,
      }),
    ]);

  return {
    adminClient,
    canManageForms: !!canManageForms,
    canViewAnalytics: !!canViewAnalytics,
    user,
  };
}
