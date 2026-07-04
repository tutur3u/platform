import type { AppSessionTargetApp } from '@tuturuuu/auth/app-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

type StoragePermissions = Awaited<ReturnType<typeof getPermissions>>;

export interface WorkspaceStorageRouteAuthContext {
  normalizedWsId: string;
  permissions: NonNullable<StoragePermissions>;
  supabase: TypedSupabaseClient;
  user: {
    email?: string | null;
    id: string;
  };
  userId: string;
}

export const FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS = [
  'drive',
  'finance',
] as const satisfies readonly AppSessionTargetApp[];

export interface WorkspaceStorageRouteAuthOptions {
  appSessionTargets?: AppSessionTargetApp | readonly AppSessionTargetApp[];
}

export async function resolveWorkspaceStorageRouteAuth(
  request: Request,
  wsId: string,
  options: WorkspaceStorageRouteAuthOptions = {}
): Promise<
  | {
      ok: true;
      context: WorkspaceStorageRouteAuthContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: options.appSessionTargets ?? 'drive',
    },
  });

  if (!auth.ok) {
    return {
      ok: false,
      response: auth.response,
    };
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, auth.supabase);
  const permissions = await getPermissions({
    user: auth.user,
    wsId: normalizedWsId,
  });

  if (!permissions) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    context: {
      normalizedWsId,
      permissions,
      supabase: auth.supabase,
      user: auth.user,
      userId: auth.user.id,
    },
  };
}

export function logWorkspaceStorageRouteError(message: string, error: unknown) {
  console.error(message, error);
}
