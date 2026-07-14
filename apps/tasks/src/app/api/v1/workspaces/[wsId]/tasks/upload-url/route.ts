import {
  createAdminClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const TASK_MEDIA_PERMISSION = 'manage_drive_tasks_directory' as const;

const ALLOWED_TASK_MEDIA_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'mp4',
  'mov',
  'webm',
  'm4v',
]);

const UploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  taskId: z.guid().optional(),
});

interface RouteParams {
  wsId: string;
}

type RoleMembershipRow = {
  workspace_roles: {
    id: string;
    name: string;
  };
};

async function resolveTaskMediaPermissions(
  wsId: string,
  context: Parameters<Parameters<typeof withSessionAuth>[0]>[1]
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);
  const permissions = await getPermissions({
    user: context.user,
    wsId: normalizedWsId,
  });

  return { normalizedWsId, permissions };
}

export const GET = withSessionAuth(
  async (_req, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId } = await params;
    const { normalizedWsId, permissions } = await resolveTaskMediaPermissions(
      wsId,
      context
    );

    if (!permissions) {
      return NextResponse.json(
        {
          code: 'TASK_MEDIA_WORKSPACE_ACCESS_UNAVAILABLE',
          error: 'Workspace access unavailable',
        },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data: roleMemberships, error: rolesError } = await sbAdmin
      .from('workspace_role_members')
      .select('workspace_roles!inner(id, name, ws_id)')
      .eq('user_id', context.user.id)
      .eq('workspace_roles.ws_id', normalizedWsId);

    if (rolesError) {
      console.error('Failed to load task media role details:', rolesError);
    }

    const roles = ((roleMemberships ?? []) as RoleMembershipRow[]).map(
      ({ workspace_roles: role }) => ({ id: role.id, name: role.name })
    );

    return NextResponse.json({
      effectivePermissions: permissions.permissions.filter(
        (permission) =>
          permission === TASK_MEDIA_PERMISSION || permission === 'admin'
      ),
      hasPermission: permissions.containsPermission(TASK_MEDIA_PERMISSION),
      membershipType: permissions.membershipType,
      permission: TASK_MEDIA_PERMISSION,
      roles,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);

export const POST = withSessionAuth(
  async (req, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId } = await params;
    const { normalizedWsId, permissions } = await resolveTaskMediaPermissions(
      wsId,
      context
    );

    if (!permissions) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (permissions.withoutPermission(TASK_MEDIA_PERMISSION)) {
      return NextResponse.json(
        {
          code: 'TASK_MEDIA_PERMISSION_DENIED',
          error: 'Insufficient permissions',
        },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parsed = UploadUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { filename, taskId } = parsed.data;
    const dotIndex = filename.lastIndexOf('.');
    const extension =
      dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

    if (!extension || !ALLOWED_TASK_MEDIA_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Only task image and video formats are allowed.',
        },
        { status: 400 }
      );
    }

    const sanitized = sanitizeFilename(filename) || 'task-media';
    const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${sanitized}`;

    if (taskId) {
      const sbAdmin = await createAdminClient();
      const { data: task, error: taskError } = await sbAdmin
        .from('tasks')
        .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
        .eq('id', taskId)
        .maybeSingle();

      if (taskError) {
        return NextResponse.json(
          { error: 'Failed to validate task' },
          { status: 500 }
        );
      }

      if (
        !task ||
        task.task_lists?.workspace_boards?.ws_id !== normalizedWsId
      ) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
    }

    const taskFolder = taskId ? `task-images/${taskId}` : 'task-images';
    const storagePath = `${normalizedWsId}/${taskFolder}/${uniqueName}`;

    const adminClient = await createDynamicAdminClient();
    const { data, error } = await adminClient.storage
      .from('workspaces')
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error || !data?.signedUrl || !data.token) {
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    const relativePath = storagePath.startsWith(`${normalizedWsId}/`)
      ? storagePath.slice(normalizedWsId.length + 1)
      : storagePath;

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: relativePath,
      fullPath: storagePath,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
