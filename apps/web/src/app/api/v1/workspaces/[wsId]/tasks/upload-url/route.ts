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

export const POST = withSessionAuth(
  async (req, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);
    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request: req,
    });

    if (!permissions) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (permissions.withoutPermission('manage_drive_tasks_directory')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
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
