import 'server-only';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const DESKTOP_ADMIN_ACTION_HEADER =
  'x-tuturuuu-desktop-deployment-action';
export type DesktopAdminDb = SupabaseClient<Database>;

export function desktopAdminFailure(status: number, code: string) {
  return NextResponse.json(
    { code },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function validateDesktopMutation(request: Request): NextResponse | null {
  // The operator app is the sole browser origin. Forwarded/configured alternative
  // hosts cannot broaden this boundary; the route must receive its public URL.
  if (request.headers.get(DESKTOP_ADMIN_ACTION_HEADER) !== '1')
    return desktopAdminFailure(403, 'desktop_mutation_forbidden');
  const origin = request.headers.get('origin');
  try {
    if (
      !origin ||
      origin !== new URL(origin).origin ||
      new URL(origin).origin !== new URL(request.url).origin ||
      new URL(origin).pathname !== '/' ||
      new URL(origin).search ||
      new URL(origin).hash
    )
      return desktopAdminFailure(403, 'desktop_mutation_forbidden');
  } catch {
    return desktopAdminFailure(403, 'desktop_mutation_forbidden');
  }
  if (
    request.headers.get('sec-fetch-site') &&
    request.headers.get('sec-fetch-site') !== 'same-origin'
  )
    return desktopAdminFailure(403, 'desktop_mutation_forbidden');
  return null;
}

export async function authorizeDesktopAdmin(request: Request) {
  try {
    const user = await getSatelliteAppSessionUser('infra');
    if (!user)
      return {
        ok: false as const,
        response: desktopAdminFailure(401, 'desktop_unauthorized'),
      };
    const db = await createAdminClient({ noCookie: true });
    // Membership is explicit: creator/admin shortcuts in shared permission
    // helpers must not admit a non-member to private signing credentials.
    const membership = await db
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('user_id', user.id)
      .eq('type', 'MEMBER')
      .maybeSingle();
    if (membership.error)
      return {
        ok: false as const,
        response: desktopAdminFailure(500, 'desktop_authorization_unavailable'),
      };
    if (!membership.data)
      return {
        ok: false as const,
        response: desktopAdminFailure(403, 'desktop_forbidden'),
      };
    const permissions = await getPermissions({
      request,
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    if (
      !permissions ||
      permissions.withoutPermission('manage_desktop_deployment_vault')
    )
      return {
        ok: false as const,
        response: desktopAdminFailure(403, 'desktop_forbidden'),
      };
    return { ok: true as const, db, userId: user.id };
  } catch {
    return {
      ok: false as const,
      response: desktopAdminFailure(500, 'desktop_authorization_unavailable'),
    };
  }
}
