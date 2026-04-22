/**
 * Time Tracking Request Signed Upload URL API
 * POST /api/v1/workspaces/[wsId]/time-tracking/requests/upload-url
 *
 * Generates a signed URL for direct upload to Supabase Storage (time_tracking_requests bucket).
 * Used by missed-entry dialog and request edit flows. Requires workspace membership.
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

const MAX_FILENAME_LENGTH = 255;
const MAX_FILES_PER_REQUEST = 5;

const UploadUrlFileSchema = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
});

const SingleUploadUrlRequestSchema = z.object({
  ...UploadUrlFileSchema.shape,
  requestId: z.guid(),
});

const BatchUploadUrlRequestSchema = z.object({
  requestId: z.guid(),
  files: z.array(UploadUrlFileSchema).min(1).max(MAX_FILES_PER_REQUEST),
});

const UploadUrlRequestSchema = z.union([
  SingleUploadUrlRequestSchema,
  BatchUploadUrlRequestSchema,
]);

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

    // Verify workspace membership
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json();
      const parsedBody = UploadUrlRequestSchema.parse(body);
      const requestId = parsedBody.requestId;
      const files =
        'files' in parsedBody
          ? parsedBody.files
          : [{ filename: parsedBody.filename }];

      const adminClient = await createDynamicAdminClient();
      const uploads = await Promise.all(
        files.map(async ({ filename }, index) => {
          // Validate file extension (images only)
          const dotIndex = filename.lastIndexOf('.');
          const fileExt =
            dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

          if (!fileExt || !ALLOWED_IMAGE_EXTENSIONS.has(fileExt)) {
            throw new Error(
              'Unsupported file type. Only PNG, JPEG, WEBP, and GIF are allowed.'
            );
          }

          const sanitized = sanitizeFilename(filename) || 'image';
          const uniqueName = `${Date.now()}_${index}_${crypto.randomUUID()}_${sanitized}`;
          const storagePath = `${requestId}/${uniqueName}`;

          const { data, error } = await adminClient.storage
            .from('time_tracking_requests')
            .createSignedUploadUrl(storagePath, { upsert: true });

          if (error || !data) {
            throw new Error('Failed to generate upload URL');
          }

          return {
            filename,
            signedUrl: data.signedUrl,
            token: data.token,
            path: storagePath,
          };
        })
      );

      if ('files' in parsedBody) {
        return NextResponse.json({ uploads });
      }

      const firstUpload = uploads[0];
      if (!firstUpload) {
        throw new Error('Failed to generate upload URL');
      }

      return NextResponse.json({
        signedUrl: firstUpload.signedUrl,
        token: firstUpload.token,
        path: firstUpload.path,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: err.issues },
          { status: 400 }
        );
      }

      if (
        err instanceof Error &&
        err.message ===
          'Unsupported file type. Only PNG, JPEG, WEBP, and GIF are allowed.'
      ) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }

      console.error('Unexpected error in time-tracking upload-url:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
