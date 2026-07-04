/**
 * Storage Analytics API
 * GET /api/v1/storage/analytics
 *
 * Retrieves storage usage analytics for the workspace
 */

import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';
import {
  getWorkspaceStorageOverview,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

export const GET = withApiAuth(
  async (_, { context }) => {
    const { wsId } = context;

    try {
      const overview = await getWorkspaceStorageOverview(wsId);
      const totalSize = overview.totalSize;
      const storageLimit = overview.storageLimit;

      // Calculate usage percentage with proper handling of edge cases
      let usagePercentage = 0;
      if (storageLimit > 0) {
        const rawPercentage = (totalSize / storageLimit) * 100;
        // Round to 2 decimal places and clamp to 0-100 range
        usagePercentage = Math.min(100, Math.round(rawPercentage * 100) / 100);
      }

      return NextResponse.json({
        data: {
          totalSize,
          fileCount: overview.fileCount,
          storageLimit,
          usagePercentage,
          largestFile: overview.largestFile,
          smallestFile: overview.smallestFile,
        },
      });
    } catch (error) {
      if (error instanceof WorkspaceStorageError) {
        return createErrorResponse(
          'Storage Error',
          error.message,
          error.status,
          'STORAGE_PROVIDER_ERROR'
        );
      }

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
