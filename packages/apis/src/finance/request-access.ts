import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export type FinanceRouteContext = {
  normalizedWsId: string;
  permissions: PermissionsResult;
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

export type FinanceRouteAuthContext = {
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

export type FinanceRouteContextResult =
  | {
      context: FinanceRouteContext;
      response?: never;
    }
  | {
      context?: never;
      response: NextResponse;
    };

async function createContextForUser({
  rawWsId,
  sbAdmin,
  supabase,
  user,
}: {
  rawWsId: string;
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
}): Promise<FinanceRouteContextResult> {
  const permissions = await getPermissions({
    wsId: rawWsId,
    user: {
      email: user.email ?? null,
      id: user.id,
    },
  });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    context: {
      normalizedWsId: permissions.wsId || rawWsId,
      permissions,
      sbAdmin,
      supabase,
      user,
    },
  };
}

export async function getFinanceRouteContext(
  request: Request,
  rawWsId: string,
  authContext?: FinanceRouteAuthContext
): Promise<FinanceRouteContextResult> {
  if (authContext) {
    return createContextForUser({
      rawWsId,
      sbAdmin: authContext.sbAdmin,
      supabase: authContext.supabase,
      user: authContext.user,
    });
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return createContextForUser({
    rawWsId,
    sbAdmin: (await createAdminClient()) as TypedSupabaseClient,
    supabase,
    user,
  });
}

export function hasAnyFinancePermission(
  permissions: PermissionsResult,
  permissionIds: PermissionId[]
) {
  return permissionIds.some(
    (permissionId) => !permissions.withoutPermission(permissionId)
  );
}

export function missingFinancePermissionResponse() {
  return NextResponse.json(
    { message: 'Insufficient permissions' },
    { status: 403 }
  );
}
