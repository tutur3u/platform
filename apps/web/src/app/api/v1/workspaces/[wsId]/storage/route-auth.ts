import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type StoragePermissions = Awaited<ReturnType<typeof getPermissions>>;

export interface WorkspaceStorageRouteAuthContext {
  normalizedWsId: string;
  permissions: NonNullable<StoragePermissions>;
  user: {
    email?: string | null;
    id: string;
  };
  userId: string;
}

export async function resolveWorkspaceStorageRouteAuth(
  request: Request,
  wsId: string
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
    allowAppSessionAuth: true,
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
      user: auth.user,
      userId: auth.user.id,
    },
  };
}

export function logWorkspaceStorageRouteError(message: string, error: unknown) {
  serverLogger.error(message, error);
}
