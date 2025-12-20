/**
 * Storage Signed Upload URL API
 * POST /api/v1/storage/upload-url
 *
 * Generates a signed URL for direct upload to Supabase Storage
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const uploadUrlRequestSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  path: z.string().optional().default(''),
  upsert: z.boolean().optional().default(false),
});

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(
      request,
      uploadUrlRequestSchema
    );
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { filename, path, upsert } = bodyResult.data;

    try {
      // Sanitize the provided path
      const sanitizedPath = sanitizePath(path);
      if (sanitizedPath === null) {
        return createErrorResponse(
          'Bad Request',
          'Invalid path: path contains illegal characters or directory traversal attempts',
          400,
          'INVALID_PATH'
        );
      }

      // Sanitize the filename
      const sanitizedFilename = sanitizeFilename(filename);
      if (!sanitizedFilename) {
        return createErrorResponse(
          'Bad Request',
          'Invalid filename: filename contains illegal characters or directory traversal attempts',
          400,
          'INVALID_FILENAME'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Construct the storage path relative to bucket
      // Path format matches Drive page: [wsId]/[path]/[filename]
      // The storage.objects.name field will automatically include bucket prefix
      const storagePath = sanitizedPath
        ? posix.join(wsId, sanitizedPath, sanitizedFilename)
        : posix.join(wsId, sanitizedFilename);

      // Generate signed upload URL
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, {
          upsert,
        });

      if (error) {
        console.error('Error generating signed upload URL:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to generate signed upload URL',
          500,
          'SIGNED_URL_ERROR'
        );
      }

      // Return the signed URL and token
      return NextResponse.json({
        data: {
          signedUrl: data.signedUrl,
          token: data.token,
          path: storagePath,
        },
      });
    } catch (error) {
      console.error('Unexpected error generating signed upload URL:', error);
      return createErrorResponse(
        'Internal Server Error',
        error instanceof Error ? error.message : 'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 30 }, // 30 signed URLs per minute
  }
);
