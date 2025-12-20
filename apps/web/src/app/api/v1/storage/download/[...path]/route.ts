/**
 * Storage Download API
 * GET /api/v1/storage/download/[...path]
 *
 * Downloads a file from the workspace drive
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

export const GET = withApiAuth(
  async (_, { params, context }) => {
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
      const supabase = await createDynamicAdminClient();

      // Construct the storage path relative to bucket
      // Path format matches Drive page: [wsId]/[path]
      const filePath = path.join('/');
      const storagePath = posix.join(wsId, filePath);

      // Download file from Supabase Storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .download(storagePath);

      if (error) {
        console.error('Error downloading file:', error);

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
          'Failed to download file',
          500,
          'STORAGE_DOWNLOAD_ERROR'
        );
      }

      // Get file metadata to set correct content type
      const { data: fileList } = await supabase.storage
        .from('workspaces')
        .list(storagePath.substring(0, storagePath.lastIndexOf('/')), {
          search: path[path.length - 1],
        });

      const fileMetadata = fileList?.find(
        (f) => f.name === path[path.length - 1]
      );
      const contentType =
        fileMetadata?.metadata?.mimetype || 'application/octet-stream';

      // Return the file as a blob
      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${path[path.length - 1]}"`,
        },
      });
    } catch (error) {
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
