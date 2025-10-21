/**
 * Storage Delete API
 * DELETE /api/v1/storage/delete
 *
 * Deletes files or folders from the workspace drive
 */

import {
  createErrorResponse,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Request body schema
const deleteBodySchema = z.object({
  paths: z.array(z.string()).min(1).max(100), // Allow batch delete up to 100 files
});

export const DELETE = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, deleteBodySchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { paths } = bodyResult.data;

    try {
      const supabase = await createClient();

      // Construct full storage paths
      const storagePaths = paths.map((path) => `${wsId}/${path}`);

      // Delete files from Supabase Storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .remove(storagePaths);

      if (error) {
        console.error('Error deleting files:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to delete files',
          500,
          'STORAGE_DELETE_ERROR'
        );
      }

      return NextResponse.json({
        message: `Successfully deleted ${data.length} file(s)`,
        data: {
          deleted: data.length,
          paths: data.map((item) => item.name),
        },
      });
    } catch (error) {
      console.error('Unexpected error deleting files:', error);
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
