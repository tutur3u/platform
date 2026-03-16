/**
 * Template Background Signed Upload URL API
 * POST /api/v1/workspaces/[wsId]/templates/upload-url
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_FILENAME_LENGTH = 255;

const UploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
});

interface RouteParams {
  wsId: string;
}

export const POST = withSessionAuth(
  async (
    req,
    { user, supabase },
    params: RouteParams | Promise<RouteParams>
  ) => {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON payload' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to parse request body' },
        { status: 500 }
      );
    }

    try {
      const { filename } = UploadUrlRequestSchema.parse(body);

      const dotIndex = filename.lastIndexOf('.');
      const extension =
        dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

      if (!extension || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
        return NextResponse.json(
          {
            error:
              'Unsupported file type. Only PNG, JPEG, and WEBP are allowed.',
          },
          { status: 400 }
        );
      }

      const sanitized = sanitizeFilename(filename) || 'template-background';
      const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${sanitized}`;
      const storagePath = `${normalizedWsId}/template-backgrounds/${uniqueName}`;

      const adminClient = await createDynamicAdminClient();
      const { data, error } = await adminClient.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (error || !data) {
        return NextResponse.json(
          { error: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path: storagePath,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error in template upload-url:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
