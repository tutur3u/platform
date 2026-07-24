import type { AppSessionTargetApp } from '@tuturuuu/auth/app-session';
import {
  AiCreditsStatusError,
  getAiCreditsStatus,
} from '@tuturuuu/payment-core/ai-credits-helper';
import {
  createAdminClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_ID_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getSatelliteAppSessionUser } from '../auth';

type RouteContext = { params: Promise<{ wsId: string }> };

const WORKSPACE_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const RESERVED_WORKSPACE_HANDLES = new Set([
  'home',
  'internal',
  'login',
  'onboarding',
  'personal',
]);
const WORKSPACE_AVATAR_EXTENSIONS = new Set([
  'gif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);

async function authorizeWorkspaceRequest(
  targetApp: AppSessionTargetApp,
  wsId: string
) {
  const user = await getSatelliteAppSessionUser(targetApp);
  if (!user) return null;

  const permissions = await getPermissions({ user, wsId });
  if (!permissions) return null;

  return { permissions, user };
}

export function createSatelliteWorkspaceRouteHandlers(
  targetApp: AppSessionTargetApp
) {
  return {
    async GET(_request: Request, { params }: RouteContext) {
      const { wsId } = await params;
      const authorization = await authorizeWorkspaceRequest(targetApp, wsId);
      if (!authorization) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const { data, error } = await sbAdmin
        .from('workspaces')
        .select('*')
        .eq('id', authorization.permissions.wsId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { message: 'Error fetching workspace' },
          { status: 500 }
        );
      }

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        },
      });
    },

    async PUT(request: Request, { params }: RouteContext) {
      const { wsId } = await params;
      const authorization = await authorizeWorkspaceRequest(targetApp, wsId);
      if (!authorization) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      if (
        !authorization.permissions.containsPermission(
          'manage_workspace_settings'
        )
      ) {
        return NextResponse.json(
          { message: 'Insufficient permissions to update workspace' },
          { status: 403 }
        );
      }

      const payload = await request.json().catch(() => null);
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      const handle =
        typeof payload?.handle === 'string'
          ? payload.handle.trim().toLowerCase() || undefined
          : undefined;

      if (!name || name.length > MAX_WORKSPACE_NAME_LENGTH) {
        return NextResponse.json(
          { message: 'Invalid workspace name' },
          { status: 400 }
        );
      }

      if (
        handle !== undefined &&
        (handle.length > MAX_ID_LENGTH ||
          !WORKSPACE_HANDLE_PATTERN.test(handle) ||
          RESERVED_WORKSPACE_HANDLES.has(handle))
      ) {
        return NextResponse.json(
          { message: 'Invalid or reserved workspace handle' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const { data: workspace, error: workspaceError } = await sbAdmin
        .from('workspaces')
        .select('personal')
        .eq('id', authorization.permissions.wsId)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { message: 'Workspace not found' },
          { status: 404 }
        );
      }

      const { data, error } = await sbAdmin
        .from('workspaces')
        .update({
          ...(workspace.personal || handle === undefined ? {} : { handle }),
          name,
        })
        .eq('id', authorization.permissions.wsId)
        .select('id');

      if (error?.code === '23505') {
        return NextResponse.json(
          { message: 'Workspace handle already exists' },
          { status: 409 }
        );
      }

      if (error) {
        console.error('Failed to update satellite workspace:', error);
        return NextResponse.json(
          { message: 'Error updating workspace' },
          { status: 500 }
        );
      }

      if (!data?.length) {
        return NextResponse.json(
          { message: 'Workspace not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ message: 'success' });
    },
  };
}

function extractWorkspaceAvatarPath(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;

  try {
    const url = new URL(avatarUrl);
    return url.pathname.split('/avatars/')[1] || null;
  } catch {
    return null;
  }
}

function hasWorkspaceSettingsPermission(
  authorization: Awaited<ReturnType<typeof authorizeWorkspaceRequest>>
) {
  return Boolean(
    authorization?.permissions.containsPermission('manage_workspace_settings')
  );
}

export function createSatelliteWorkspaceAvatarRouteHandlers(
  targetApp: AppSessionTargetApp
) {
  return {
    async PATCH(request: Request, { params }: RouteContext) {
      const { wsId } = await params;
      const authorization = await authorizeWorkspaceRequest(targetApp, wsId);
      if (!authorization) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      if (!hasWorkspaceSettingsPermission(authorization)) {
        return NextResponse.json(
          { message: 'Insufficient permissions to update workspace' },
          { status: 403 }
        );
      }

      const payload = await request.json().catch(() => null);
      const filePath =
        typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
      const workspacePath = `workspaces/${authorization.permissions.wsId}/`;
      if (!filePath?.startsWith(workspacePath)) {
        return NextResponse.json(
          { message: 'Invalid file path' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const { data: publicUrlData } = sbAdmin.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const { error } = await sbAdmin
        .from('workspaces')
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq('id', authorization.permissions.wsId);

      if (error) {
        console.error('Failed to update satellite workspace avatar:', error);
        return NextResponse.json(
          { message: 'Error updating workspace avatar' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        avatarUrl: publicUrlData.publicUrl,
        success: true,
      });
    },

    async DELETE(_request: Request, { params }: RouteContext) {
      const { wsId } = await params;
      const authorization = await authorizeWorkspaceRequest(targetApp, wsId);
      if (!authorization) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      if (!hasWorkspaceSettingsPermission(authorization)) {
        return NextResponse.json(
          { message: 'Insufficient permissions to update workspace' },
          { status: 403 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const { data: workspace, error: workspaceError } = await sbAdmin
        .from('workspaces')
        .select('avatar_url')
        .eq('id', authorization.permissions.wsId)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { message: 'Workspace not found' },
          { status: 404 }
        );
      }

      const { error: updateError } = await sbAdmin
        .from('workspaces')
        .update({ avatar_url: null })
        .eq('id', authorization.permissions.wsId);
      if (updateError) {
        console.error(
          'Failed to remove satellite workspace avatar:',
          updateError
        );
        return NextResponse.json(
          { message: 'Error removing workspace avatar' },
          { status: 500 }
        );
      }

      const existingPath = extractWorkspaceAvatarPath(workspace.avatar_url);
      if (existingPath) {
        const { error: storageError } = await sbAdmin.storage
          .from('avatars')
          .remove([existingPath]);
        if (storageError) {
          console.warn(
            'Failed to remove the previous satellite workspace avatar file:',
            storageError
          );
        }
      }

      return NextResponse.json({ success: true });
    },
  };
}

export function createSatelliteWorkspaceAvatarUploadRouteHandler(
  targetApp: AppSessionTargetApp
) {
  return async function POST(request: Request, { params }: RouteContext) {
    const { wsId } = await params;
    const authorization = await authorizeWorkspaceRequest(targetApp, wsId);
    if (!authorization) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (!hasWorkspaceSettingsPermission(authorization)) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update workspace' },
        { status: 403 }
      );
    }

    const payload = await request.json().catch(() => null);
    const filename =
      typeof payload?.filename === 'string' ? payload.filename.trim() : '';
    const filenameParts = filename.split('.');
    const fileExtension = filenameParts.at(-1)?.toLowerCase();
    if (
      filename.length < 3 ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filenameParts.length < 2 ||
      !fileExtension ||
      !WORKSPACE_AVATAR_EXTENSIONS.has(fileExtension)
    ) {
      return NextResponse.json(
        { message: 'Invalid avatar filename' },
        { status: 400 }
      );
    }

    const filePath = `workspaces/${authorization.permissions.wsId}/avatar-${Date.now()}.${fileExtension}`;
    const sbStorageAdmin = await createDynamicAdminClient();
    const { data, error } = await sbStorageAdmin.storage
      .from('avatars')
      .createSignedUploadUrl(filePath, { upsert: false });
    if (error || !data) {
      console.error(
        'Failed to create satellite workspace avatar upload target:',
        error
      );
      return NextResponse.json(
        { message: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = sbStorageAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);
    return NextResponse.json({
      filePath,
      publicUrl: publicUrlData.publicUrl,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  };
}

export function createSatelliteAiCreditsRouteHandler(
  targetApp: AppSessionTargetApp
) {
  return async function GET(_request: Request, { params }: RouteContext) {
    const user = await getSatelliteAppSessionUser(targetApp);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const { wsId } = await params;
      const accessClient = await createAdminClient({ noCookie: true });
      const status = await getAiCreditsStatus({
        accessClient,
        userId: user.id,
        wsId,
      });

      return NextResponse.json(status, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=30',
        },
      });
    } catch (error) {
      if (error instanceof AiCreditsStatusError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }

      console.error('Failed to get satellite AI credit status:', error);
      return NextResponse.json(
        { error: 'Failed to get AI credit status' },
        { status: 500 }
      );
    }
  };
}
