import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const uuidSchema = z.guid();
const canonicalUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function getWorkspaceRouteContext(
  request: Request,
  wsIdParam: string
) {
  const resolvedWsId = await normalizeWorkspaceId(wsIdParam);
  const parsedWsId = uuidSchema.safeParse(resolvedWsId);

  if (!parsedWsId.success) {
    throw new Error('Invalid workspace ID');
  }

  const supabase = await createClient(request);
  const adminClient = await createAdminClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      supabase,
      adminClient,
      user: null,
      wsId: parsedWsId.data,
      canManageForms: false,
      canViewAnalytics: false,
    };
  }

  const [membership, { data: canManageForms }, { data: canViewAnalytics }] =
    await Promise.all([
      verifyWorkspaceMembershipType({
        wsId: parsedWsId.data,
        userId: user.id,
        supabase: adminClient,
      }),
      supabase.rpc('has_workspace_permission', {
        p_user_id: user.id,
        p_ws_id: parsedWsId.data,
        p_permission: 'manage_forms',
      }),
      supabase.rpc('has_workspace_permission', {
        p_user_id: user.id,
        p_ws_id: parsedWsId.data,
        p_permission: 'view_form_analytics',
      }),
    ]);

  return {
    supabase,
    adminClient,
    user,
    wsId: parsedWsId.data,
    isMember: membership.ok,
    canManageForms: !!canManageForms,
    canViewAnalytics: !!canViewAnalytics,
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
