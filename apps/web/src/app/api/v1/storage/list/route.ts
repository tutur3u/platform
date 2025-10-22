/**
 * Storage List API
 * GET /api/v1/storage/list
 *
 * Lists files and folders in the workspace drive
 */

import {
  createErrorResponse,
  validateQueryParams,
  withApiAuth,
} from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Query parameters schema
const listQuerySchema = z.object({
  path: z.string().optional().default(''),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sortBy: z
    .enum(['name', 'created_at', 'updated_at', 'size'])
    .optional()
    .default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const GET = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate query parameters
    const paramsResult = validateQueryParams(request, listQuerySchema);
    if (paramsResult instanceof NextResponse) {
      return paramsResult;
    }

    const { path, search, limit, offset, sortBy, sortOrder } =
      paramsResult.data;

    try {
      const supabase = await createClient();

      // List files from Supabase Storage
      const storagePath = path ? `${wsId}/${path}` : wsId;

      const { data: files, error } = await supabase.storage
        .from('workspaces')
        .list(storagePath, {
          limit,
          offset,
          sortBy: {
            column: sortBy,
            order: sortOrder,
          },
          search: search || undefined,
        });

      if (error) {
        console.error('Error listing files:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to list files',
          500,
          'STORAGE_LIST_ERROR'
        );
      }

      // Filter out .emptyFolderPlaceholder files
      const filteredFiles = files?.filter(
        (file) => file.name !== '.emptyFolderPlaceholder'
      );

      return NextResponse.json({
        data: filteredFiles || [],
        pagination: {
          limit,
          offset,
          filteredTotal: filteredFiles?.length || 0,
        },
      });
    } catch (error) {
      console.error('Unexpected error listing files:', error);
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
