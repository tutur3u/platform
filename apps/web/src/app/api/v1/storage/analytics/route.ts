/**
 * Storage Analytics API
 * GET /api/v1/storage/analytics
 *
 * Retrieves storage usage analytics for the workspace
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';
import { getWorkspaceStorageMetrics } from '@/lib/storage-analytics';

export const GET = withApiAuth(
  async (_, { context }) => {
    const { wsId } = context;

    try {
      const supabase = await createDynamicAdminClient();

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

      const storageMetrics = await getWorkspaceStorageMetrics(supabase, wsId);
      const totalSize = sizeData || 0;

      // Get storage limit from workspace_secrets or use 100MB default
      const { data: storageLimitData, error: limitError } = await supabase.rpc(
        'get_workspace_storage_limit',
        { p_ws_id: wsId }
      );

      if (limitError) {
        console.error('Error fetching storage limit:', limitError);
      }

      const storageLimit = storageLimitData ?? 104857600; // 100MB default

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
          fileCount: storageMetrics.fileCount,
          storageLimit,
          usagePercentage,
          largestFile: storageMetrics.largestFile,
          smallestFile: storageMetrics.smallestFile,
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
