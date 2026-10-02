/**
 * Storage Share API
 * POST /api/v1/storage/share
 *
 * Generates a signed URL for sharing a file
 */

import { createGuardedSupabaseStorageReadUrl } from '@tuturuuu/storage-core/storage-download-sign';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { imageTransformOptionsSchema } from '@tuturuuu/types';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectReservedStoragePath } from '@/legacy-api-routes/v1/storage/reserved-path';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const shareSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
  expiresIn: z.number().int().min(60).max(604800).optional().default(3600), // 1 minute to 7 days, default 1 hour
  transform: imageTransformOptionsSchema.optional(),
});

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, shareSchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { path, expiresIn } = bodyResult.data;

    try {
      const sanitizedPath = sanitizePath(path);
      if (sanitizedPath === null || !sanitizedPath) {
        return createErrorResponse(
          'Bad Request',
          'Invalid path',
          400,
          'INVALID_PATH'
        );
      }

      const reservedPathResponse = rejectReservedStoragePath(
        wsId,
        sanitizedPath
      );
      if (reservedPathResponse) {
        return reservedPathResponse;
      }

      const supabase = await createDynamicAdminClient();

      // Construct the full storage path
      const storagePath = `${wsId}/${sanitizedPath}`;

      const signedUrl = await createGuardedSupabaseStorageReadUrl(
        supabase,
        wsId,
        storagePath,
        expiresIn,
        bodyResult.data.transform
      );

      return NextResponse.json({
        message: 'Signed URL created successfully',
        data: {
          signedUrl,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          expiresIn,
        },
      });
    } catch (error) {
      console.error('Unexpected error creating signed URL:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_drive'] }
);
