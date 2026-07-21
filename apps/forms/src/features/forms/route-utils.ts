import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getWorkspace,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

const uuidSchema = z.guid();
const canonicalUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/**
 * Resolves the actor, workspace, and forms permissions for a workspace-scoped
 * forms API route.
 *
 * Satellite-specific: apps/forms authenticates with a Tuturuuu app-session JWT,
 * NOT a Supabase auth cookie. Resolving the actor from a cookie-backed Supabase
 * client (as apps/web did) yields an ANONYMOUS client here, which would make
 * every workspace route return 401. Resolve the actor from the app session and
 * inject it into `getWorkspace`, then run every privileged read through the
 * admin client — forms tables live in the Postgres `private` schema and are
 * unreachable from an anon/RLS client regardless.
 */
export async function getWorkspaceRouteContext(
  _request: Request,
  wsIdParam: string
) {
  const adminClient = await createAdminClient();
  const user = await getSatelliteAppSessionUser('forms');

  if (!user?.id) {
    return {
      adminClient,
      canManageForms: false,
      canViewAnalytics: false,
      isMember: false,
      user: null,
      wsId: '',
    };
  }

  // `getWorkspace` with an injected principal resolves the `personal` alias and
  // workspace handles without touching Supabase auth.
  const workspace = await getWorkspace(wsIdParam, { useAdmin: true, user });

  if (!workspace) {
    throw new Error('Invalid workspace ID');
  }

  const parsedWsId = uuidSchema.safeParse(workspace.id);

  if (!parsedWsId.success) {
    throw new Error('Invalid workspace ID');
  }

  const [membership, { data: canManageForms }, { data: canViewAnalytics }] =
    await Promise.all([
      verifyWorkspaceMembershipType({
        supabase: adminClient,
        userId: user.id,
        wsId: parsedWsId.data,
      }),
      adminClient.rpc('has_workspace_permission', {
        p_permission: 'manage_forms',
        p_user_id: user.id,
        p_ws_id: parsedWsId.data,
      }),
      adminClient.rpc('has_workspace_permission', {
        p_permission: 'view_form_analytics',
        p_user_id: user.id,
        p_ws_id: parsedWsId.data,
      }),
    ]);

  return {
    adminClient,
    canManageForms: !!canManageForms,
    canViewAnalytics: !!canViewAnalytics,
    isMember: membership.ok,
    user,
    wsId: parsedWsId.data,
  };
}

export function parseUuidParam(value: string, label: string) {
  const parsed = uuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Invalid ${label}`);
  }

  return parsed.data;
}

export function parseFormIdParam(value: string, label: string) {
  const parsed = canonicalUuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Invalid ${label}`);
  }

  return parsed.data;
}
