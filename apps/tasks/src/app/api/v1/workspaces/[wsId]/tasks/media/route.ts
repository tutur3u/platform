import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  removeUnreferencedTaskMedia,
  taskMediaFilename,
} from '@/lib/task-media-cleanup';

const DeleteMediaSchema = z.object({
  paths: z.array(z.string()).min(1).max(20),
});

export const DELETE = withSessionAuth(
  async (
    req,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
  ) => {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);
    const permissions = await getPermissions({
      user: context.user,
      wsId: normalizedWsId,
    });

    if (!permissions?.containsPermission('manage_drive_tasks_directory')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const parsed = DeleteMediaSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Immediate deletion is limited to unassigned uploads made while creating
    // a task. Existing-task media waits for the scheduled reference sweep.
    const paths = parsed.data.paths.map((path) =>
      path.startsWith(`${normalizedWsId}/`) ? path : `${normalizedWsId}/${path}`
    );
    if (
      paths.some(
        (path) =>
          !path.startsWith(`${normalizedWsId}/task-images/`) ||
          path.split('/').length !== 3 ||
          !taskMediaFilename(path)
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid task media path' },
        { status: 400 }
      );
    }

    try {
      const admin = await createAdminClient();
      let deleted = 0;
      for (const path of paths) {
        if (await removeUnreferencedTaskMedia(admin, path)) deleted++;
      }
      return NextResponse.json({ deleted });
    } catch (error) {
      console.error('Failed to clean up discarded task media:', error);
      return NextResponse.json(
        { error: 'Failed to clean up task media' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
