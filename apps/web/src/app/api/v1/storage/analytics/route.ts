/**
 * Storage Analytics API
 * GET /api/v1/storage/analytics
 *
 * Retrieves storage usage analytics for the workspace
 */

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

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

      // Get file count from database (same method as Drive page)
      const { count: fileCount, error: countError } = await supabase
        .schema('storage')
        .from('objects')
        .select('*', { count: 'exact', head: true })
        .eq('bucket_id', 'workspaces')
        .ilike('name', `${wsId}/%`)
        .not('name', 'ilike', '%/.emptyFolderPlaceholder');

      if (countError) {
        console.error('Error counting files:', countError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to count files',
          500,
          'STORAGE_COUNT_ERROR'
        );
      }

      // Get largest and smallest file metadata
      const { data: largestFileData, error: largestError } = await supabase
        .schema('storage')
        .from('objects')
        .select('metadata, name, created_at')
        .eq('bucket_id', 'workspaces')
        .ilike('name', `${wsId}/%`)
        .not('name', 'ilike', '%/.emptyFolderPlaceholder')
        .order('metadata->size', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: smallestFileData, error: smallestError } = await supabase
        .schema('storage')
        .from('objects')
        .select('metadata, name, created_at')
        .eq('bucket_id', 'workspaces')
        .ilike('name', `${wsId}/%`)
        .not('name', 'ilike', '%/.emptyFolderPlaceholder')
        .order('metadata->size', { ascending: true })
        .limit(1)
        .maybeSingle();
      const totalSize = sizeData || 0;

      if (largestError) {
        console.error('Error fetching largest file:', largestError);
      }

      if (smallestError) {
        console.error('Error fetching smallest file:', smallestError);
      }

      // Get storage limit from workspace_secrets or use 100MB default
      const { data: storageLimitData, error: limitError } = await supabase.rpc(
        'get_workspace_storage_limit',
        { ws_id: wsId }
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
          fileCount: fileCount || 0,
          storageLimit,
          usagePercentage,
          largestFile: largestFileData
            ? {
                name: largestFileData.name,
                size: largestFileData.metadata?.size || 0,
                createdAt: largestFileData.created_at,
              }
            : null,
          smallestFile: smallestFileData
            ? {
                name: smallestFileData.name,
                size: smallestFileData.metadata?.size || 0,
                createdAt: smallestFileData.created_at,
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
