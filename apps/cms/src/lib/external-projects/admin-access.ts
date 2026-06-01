import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { hasRootExternalProjectsAdminPermission } from './access';

export async function requireCmsRootExternalProjectsAdmin() {
  const user = await getSatelliteAppSessionUser('cms');

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!hasRootExternalProjectsAdminPermission(permissions)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin: (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient,
    permissions: permissions as PermissionsResult,
    user,
  };
}
