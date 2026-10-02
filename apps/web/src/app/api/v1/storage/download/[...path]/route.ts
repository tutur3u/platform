/**
 * Storage Download API
 * GET /api/v1/storage/download/[...path]
 *
 * Downloads a file from the workspace drive
 */

import { posix } from 'node:path';
import { relayStorageDownload } from '@tuturuuu/storage-core/storage-download-relay';
import { createGuardedSupabaseStorageReadUrl } from '@tuturuuu/storage-core/storage-download-sign';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectReservedStoragePath } from '@/legacy-api-routes/v1/storage/reserved-path';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

const transformQuerySchema = z
  .object({
    width: z.coerce.number().int().min(1).max(2500).finite().optional(),
    height: z.coerce.number().int().min(1).max(2500).finite().optional(),
    resize: z.enum(['cover', 'contain', 'fill']).optional(),
    quality: z.coerce.number().int().min(20).max(100).finite().optional(),
    format: z.literal('origin').optional(),
  })
  .refine((data) => data.width !== undefined || data.height !== undefined, {
    message: 'transform must include width or height',
  });

export const GET = withApiAuth(
  async (request, { params, context }) => {
    const { wsId } = context;
    const { path } = (await params) as unknown as { path: string[] };

    if (!path || path.length === 0) {
      return createErrorResponse(
        'Bad Request',
        'Missing file path',
        400,
        'MISSING_PATH'
      );
    }

    try {
      const { searchParams } = new URL(request.url);
      const transformInput = {
        width: searchParams.get('width') ?? undefined,
        height: searchParams.get('height') ?? undefined,
        resize: searchParams.get('resize') ?? undefined,
        quality: searchParams.get('quality') ?? undefined,
        format: searchParams.get('format') ?? undefined,
      };
      const hasTransform = Object.values(transformInput).some(
        (value) => value !== undefined
      );
      const transform = hasTransform
        ? transformQuerySchema.parse(transformInput)
        : undefined;

      // Construct the storage path relative to bucket
      // Path format matches Drive page: [wsId]/[path]
      const filePath = sanitizePath(path.join('/'));
      if (filePath === null || !filePath) {
        return createErrorResponse(
          'Bad Request',
          'Invalid file path',
          400,
          'INVALID_PATH'
        );
      }

      const reservedPathResponse = rejectReservedStoragePath(wsId, filePath);
      if (reservedPathResponse) {
        return reservedPathResponse;
      }

      const supabase = await createDynamicAdminClient();
      const storagePath = posix.join(wsId, filePath);
      const fileName = posix.basename(filePath);

      const url = await createGuardedSupabaseStorageReadUrl(
        supabase,
        wsId,
        storagePath,
        3600,
        transform
      );
      const token = new URL(url).pathname.split('/').pop();
      if (!token) throw new Error('Missing download ticket');
      const response = await relayStorageDownload(request, token);
      if (response.ok) {
        response.headers.set(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
      }
      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(
          'Bad Request',
          'Invalid image transform options',
          400,
          'INVALID_TRANSFORM'
        );
      }

      console.error('Unexpected error downloading file:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 50 }, // 50 downloads per minute
  }
);
