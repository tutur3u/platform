/**
 * Storage Share API
 * POST /api/v1/storage/share
 *
 * Generates a signed URL for sharing a file
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const shareSchema = z.object({
  path: z.string().min(1),
  expiresIn: z.number().int().min(60).max(604800).optional().default(3600), // 1 minute to 7 days, default 1 hour
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
      const supabase = await createDynamicAdminClient();

      // Construct the full storage path
      const storagePath = `${wsId}/${path}`;

      // Generate signed URL
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUrl(storagePath, expiresIn);

      if (error) {
        console.error('Error creating signed URL:', error);

        if (error.message.includes('not found')) {
          return createErrorResponse(
            'Not Found',
            'File not found',
            404,
            'FILE_NOT_FOUND'
          );
        }

        return createErrorResponse(
          'Internal Server Error',
          'Failed to create signed URL',
          500,
          'STORAGE_SHARE_ERROR'
        );
      }

      return NextResponse.json({
        message: 'Signed URL created successfully',
        data: {
          signedUrl: data.signedUrl,
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
