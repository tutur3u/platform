import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeInfrastructureMigrationExport(
  request: Request,
  wsId: string
) {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch (error) {
    console.error('Error normalizing infrastructure export workspace:', {
      error,
      wsId,
    });

    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const permissions = await getPermissions({
    request,
    wsId: normalizedWsId,
  });

  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (!permissions.containsPermission('manage_external_migrations')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    value: {
      userId: user.id,
      wsId: normalizedWsId,
    },
  };
}
