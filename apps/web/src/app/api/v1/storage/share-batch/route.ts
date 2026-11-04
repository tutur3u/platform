/**
 * Storage Batch Share API
 * POST /api/v1/storage/share-batch
 *
 * Generates signed URLs for multiple files in a single request
 */

import { createGuardedSupabaseStorageReadUrl } from '@tuturuuu/storage-core/storage-download-sign';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { SignedUrlData } from '@tuturuuu/types';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectReservedStoragePath } from '@/legacy-api-routes/v1/storage/reserved-path';
import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';
import {
  auditStorageAccess,
  withStorageAccessAudit,
} from '@/lib/storage/storage-access-audit';

// Request body schema
const batchShareSchema = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1, 'At least one path is required')
    .max(100, 'Maximum 100 paths can be processed at once'),
  expiresIn: z.number().int().min(60).max(604800).optional().default(3600), // 1 minute to 7 days, default 1 hour
});

const AUDIT_ROUTE = '/api/v1/storage/share-batch';

export const POST = withApiAuth(
  withStorageAccessAudit(
    { action: 'share', route: AUDIT_ROUTE },
    async (
      audit,
      request: NextRequest,
      { context }: { context: { keyId: string; wsId: string } }
    ) => {
      const { wsId } = context;
      const actor = { actorId: context.keyId, actorKind: 'api_key' as const };
      audit.set({ ...actor, wsId });

      // Validate request body
      const bodyResult = await validateRequestBody(request, batchShareSchema);
      if (bodyResult instanceof NextResponse) {
        return bodyResult;
      }

      const { paths, expiresIn } = bodyResult.data;
      audit.set({ itemCount: paths.length });

      try {
        const pathRequests: Array<{
          originalPath: string;
          sanitizedPath: string;
        }> = [];

        for (const path of paths) {
          const sanitizedPath = sanitizePath(path);
          if (sanitizedPath === null || !sanitizedPath) {
            return createErrorResponse(
              'Bad Request',
              `Invalid path: ${path}`,
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

          pathRequests.push({ originalPath: path, sanitizedPath });
        }

        const supabase = await createDynamicAdminClient();

        // Process all paths in parallel
        const results = await Promise.all(
          pathRequests.map(async ({ originalPath, sanitizedPath }) => {
            // Construct the full storage path with workspace ID
            const storagePath = `${wsId}/${sanitizedPath}`;

            try {
              const signedUrl = await createGuardedSupabaseStorageReadUrl(
                supabase,
                wsId,
                storagePath,
                expiresIn
              );

              return {
                path: originalPath,
                signedUrl,
                expiresAt: new Date(
                  Date.now() + expiresIn * 1000
                ).toISOString(),
                expiresIn,
              };
            } catch (err) {
              return {
                path: originalPath,
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

        for (const item of results) {
          data.push(item);
          if (item.error) errors.push({ path: item.path, error: item.error });
        }

        // One row per object instead of the request-level row.
        audit.skip();
        auditStorageAccess(
          pathRequests.map(({ sanitizedPath }, index) => ({
            ...actor,
            action: 'share' as const,
            outcome: results[index]?.error ? 'error' : 'allowed',
            path: sanitizedPath,
            route: AUDIT_ROUTE,
            wsId,
          }))
        );

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
    }
  ),
  { permissions: ['manage_drive'] }
);
