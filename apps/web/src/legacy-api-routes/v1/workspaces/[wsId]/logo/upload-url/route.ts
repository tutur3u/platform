import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const UploadWorkspaceLogoSchema = z.object({
  filename: z
    .string()
    .min(3)
    .regex(/^[^\\/]+\.[^\\/]+$/),
});

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, _context, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      if (permissions.withoutPermission('manage_workspace_settings')) {
        return NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const body = UploadWorkspaceLogoSchema.safeParse(await request.json());

      if (!body.success) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: body.error.issues },
          { status: 400 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      const fileExt = body.data.filename.split('.').pop()?.toLowerCase();
      const allowedExtensions = new Set([
        'png',
        'jpg',
        'jpeg',
        'gif',
        'webp',
        'svg',
      ]);

      if (!fileExt || !allowedExtensions.has(fileExt)) {
        return NextResponse.json(
          { message: 'Invalid file extension' },
          { status: 400 }
        );
      }

      const filePath = `${normalizedWsId}/logos/logo-${Date.now()}.${fileExt}`;
      const sbStorageAdmin = await createDynamicAdminClient();
      const { data, error } = await sbStorageAdmin.storage
        .from('workspaces')
        .createSignedUploadUrl(filePath, { upsert: false });

      if (error || !data) {
        return NextResponse.json(
          { message: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        signedUrl: data.signedUrl,
        token: data.token,
        filePath,
      });
    } catch (error) {
      console.error('Error generating workspace logo upload URL:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
