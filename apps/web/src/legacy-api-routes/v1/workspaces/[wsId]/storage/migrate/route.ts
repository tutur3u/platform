import { WORKSPACE_STORAGE_PROVIDER_OPTIONS } from '@tuturuuu/storage-core/workspace-storage-config';
import { migrateWorkspaceStorageBetweenProviders } from '@tuturuuu/storage-core/workspace-storage-migration';
import { WorkspaceStorageError } from '@tuturuuu/storage-core/workspace-storage-provider';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const migrateSchema = z.object({
  sourceProvider: z.enum(WORKSPACE_STORAGE_PROVIDER_OPTIONS),
  targetProvider: z.enum(WORKSPACE_STORAGE_PROVIDER_OPTIONS),
  overwrite: z.boolean().optional(),
});

/**
 * Storage provider rollout is platform-controlled: only root-workspace secret
 * or role managers may use it. A workspace-level grant is not enough, because
 * workspace creators and `admin` members imply manage_workspace_secrets for
 * their own workspace.
 */
function canManageSecretsForWorkspace(
  rootPermissions: Awaited<ReturnType<typeof getPermissions>>
) {
  return Boolean(
    rootPermissions?.containsPermission('manage_workspace_roles') ||
    rootPermissions?.containsPermission('manage_workspace_secrets')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, user } = auth.context;
    const rootPermissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });

    if (!canManageSecretsForWorkspace(rootPermissions)) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = migrateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await migrateWorkspaceStorageBetweenProviders(
      normalizedWsId,
      {
        sourceProvider: parsed.data.sourceProvider,
        targetProvider: parsed.data.targetProvider,
        overwrite: parsed.data.overwrite ?? false,
      }
    );

    return NextResponse.json({
      message: 'Workspace storage migration completed successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Workspace storage migration error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
