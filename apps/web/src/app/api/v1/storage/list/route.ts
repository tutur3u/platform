/**
 * Storage List API
 * GET /api/v1/storage/list
 *
 * Lists files and folders in the workspace drive
 */

import { posix } from 'node:path';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateQueryParams,
  withApiAuth,
} from '@/lib/api-middleware';

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
      // Use admin client to bypass RLS policies when using API key authentication
      const supabase = await createDynamicAdminClient();

      // List files from Supabase Storage
      // Path format matches Drive page: [wsId]/[path]
      const trimmedPath = path.replace(/^\/+|\/+$/g, '');
      const storagePath = trimmedPath ? posix.join(wsId, trimmedPath) : wsId;

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

      // Get total count of matching records from storage.objects table
      let totalCount = 0;
      try {
        // Build count query with same filters
        let countQuery = supabase
          .schema('storage')
          .from('objects')
          .select('*', { count: 'exact', head: true })
          .eq('bucket_id', 'workspaces');

        // Apply path filter (match the folder path)
        if (storagePath) {
          countQuery = countQuery.like('name', `${storagePath}/%`);
        }

        // Apply search filter if provided
        if (search) {
          countQuery = countQuery.ilike('name', `%${search}%`);
        }

        const { count, error: countError } = await countQuery;

        if (countError) {
          console.error('Error counting files:', countError);
          // Fallback to current page count if count query fails
          totalCount = filteredFiles?.length || 0;
        } else {
          // Subtract .emptyFolderPlaceholder files from count
          totalCount = Math.max(
            0,
            (count || 0) - (files?.length || 0) + (filteredFiles?.length || 0)
          );
        }
      } catch (countErr) {
        console.error('Unexpected error counting files:', countErr);
        // Fallback to current page count
        totalCount = filteredFiles?.length || 0;
      }

      return NextResponse.json({
        data: filteredFiles || [],
        pagination: {
          limit,
          offset,
          total: totalCount,
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
