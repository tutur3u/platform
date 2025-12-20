/**
 * Storage Batch Share API
 * POST /api/v1/storage/share-batch
 *
 * Generates signed URLs for multiple files in a single request
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { SignedUrlData } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Request body schema
const batchShareSchema = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1, 'At least one path is required')
    .max(100, 'Maximum 100 paths can be processed at once'),
  expiresIn: z.number().int().min(60).max(604800).optional().default(3600), // 1 minute to 7 days, default 1 hour
});

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, batchShareSchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { paths, expiresIn } = bodyResult.data;

    try {
      const supabase = await createDynamicAdminClient();

      // Process all paths in parallel
      const results = await Promise.allSettled(
        paths.map(async (path) => {
          // Construct the full storage path with workspace ID
          const storagePath = `${wsId}/${path}`;

          try {
            // Generate signed URL
            const { data, error } = await supabase.storage
              .from('workspaces')
              .createSignedUrl(storagePath, expiresIn);

            if (error) {
              return {
                path,
                signedUrl: '',
                error: error.message || 'Failed to generate signed URL',
              };
            }

            return {
              path,
              signedUrl: data.signedUrl,
              expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
              expiresIn,
            };
          } catch (err) {
            return {
              path,
              signedUrl: '',
              error:
                err instanceof Error ? err.message : 'Failed to generate URL',
            };
          }
        })
      );

      // Process results into separate arrays
      const data: SignedUrlData[] = [];
      const errors: Array<{ path: string; error: string }> = [];

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const item = result.value;
          if (item.error) {
            // Include failed items in data array with error field
            data.push({
              path: item.path,
              signedUrl: '',
              error: item.error,
            });
            // Also add to errors array for convenience
            errors.push({ path: item.path, error: item.error });
          } else {
            // Successful items
            data.push({
              path: item.path,
              signedUrl: item.signedUrl,
              expiresAt: item.expiresAt,
              expiresIn: item.expiresIn,
            });
          }
        } else {
          // Promise rejected
          const path = paths[results.indexOf(result)] || 'unknown';
          data.push({
            path,
            signedUrl: '',
            error: result.reason?.message || 'Unexpected error',
          });
          errors.push({
            path,
            error: result.reason?.message || 'Unexpected error',
          });
        }
      });

      return NextResponse.json({
        message: 'Batch signed URLs generated',
        data,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Unexpected error generating batch signed URLs:', error);
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
