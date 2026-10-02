import { isSecurityEgressEnforcementEnabled } from '@tuturuuu/storage-core/security-budget';
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
import {
  encodeDownloadFilename,
  storageDownloadErrorResponse,
} from '@/lib/storage-download-response';

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

      if (!isSecurityEgressEnforcementEnabled()) {
        if (process.env.STORAGE_DOWNLOADS_DISABLED === 'true') {
          return createErrorResponse(
            'Unavailable',
            'Storage downloads are temporarily disabled',
            503,
            'STORAGE_DISABLED'
          );
        }
        const { data, error } = await supabase.storage
          .from('workspaces')
          .download(storagePath, transform ? { transform } : undefined);
        if (error || !data) {
          const notFound =
            error &&
            (String(error.status) === '404' ||
              /not found/iu.test(error.message));
          return createErrorResponse(
            notFound ? 'Not Found' : 'Internal Server Error',
            notFound ? 'File not found' : 'Failed to download file',
            notFound ? 404 : 500,
            notFound ? 'FILE_NOT_FOUND' : 'DOWNLOAD_FAILED'
          );
        }
        return new NextResponse(data, {
          headers: {
            'Content-Type': data.type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeDownloadFilename(fileName)}`,
            'Cache-Control': 'private, no-store',
          },
        });
      }

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
          `attachment; filename*=UTF-8''${encodeDownloadFilename(fileName)}`
        );
      }
      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      const storageError = storageDownloadErrorResponse(error);
      if (storageError) return storageError;
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
