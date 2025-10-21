/**
 * Storage Analytics API
 * GET /api/v1/storage/analytics
 *
 * Retrieves storage usage analytics for the workspace
 */

import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const GET = withApiAuth(
  async (_, { context }) => {
    const { wsId } = context;

    try {
      const supabase = await createAdminClient();

      // Get total storage size using RPC function
      const { data: sizeData, error: sizeError } = await supabase.rpc(
        'get_workspace_drive_size',
        { ws_id: wsId }
      );

      if (sizeError) {
        console.error('Error fetching drive size:', sizeError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to fetch storage size',
          500,
          'STORAGE_SIZE_ERROR'
        );
      }

      // List all files to calculate statistics
      const { data: files, error: listError } = await supabase.storage
        .from('workspaces')
        .list(wsId, {
          limit: 10000, // High limit to get all files
          sortBy: { column: 'name', order: 'asc' },
        });

      if (listError) {
        console.error('Error listing files:', listError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to list files',
          500,
          'STORAGE_LIST_ERROR'
        );
      }

      // Filter out placeholder files and calculate statistics
      const realFiles = files?.filter(
        (file) => file.name !== '.emptyFolderPlaceholder' && !file.id
      );

      const fileCount = realFiles?.length || 0;
      const totalSize = sizeData || 0;

      // Calculate largest and smallest files
      let largestFile = null;
      let smallestFile = null;

      if (realFiles && realFiles.length > 0) {
        const filesWithSize = realFiles.filter(
          (f) => f.metadata && typeof f.metadata.size === 'number'
        );

        if (filesWithSize.length > 0) {
          largestFile = filesWithSize.reduce((prev, current) =>
            (prev.metadata?.size || 0) > (current.metadata?.size || 0)
              ? prev
              : current
          );

          smallestFile = filesWithSize.reduce((prev, current) =>
            (prev.metadata?.size || 0) < (current.metadata?.size || 0)
              ? prev
              : current
          );
        }
      }

      // Storage limits (from drive page logic)
      const isRootWorkspace = wsId === '00000000-0000-0000-0000-000000000000'; // Adjust based on your root workspace ID logic
      const storageLimit = isRootWorkspace
        ? 100 * 1024 * 1024 * 1024 // 100 GB
        : 50 * 1024 * 1024; // 50 MB

      return NextResponse.json({
        data: {
          totalSize,
          fileCount,
          storageLimit,
          usagePercentage: (totalSize / storageLimit) * 100,
          largestFile: largestFile
            ? {
                name: largestFile.name,
                size: largestFile.metadata?.size || 0,
                createdAt: largestFile.created_at,
              }
            : null,
          smallestFile: smallestFile
            ? {
                name: smallestFile.name,
                size: smallestFile.metadata?.size || 0,
                createdAt: smallestFile.created_at,
              }
            : null,
        },
      });
    } catch (error) {
      console.error('Unexpected error fetching analytics:', error);
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
