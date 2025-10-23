/**
 * Debug Workspace API
 * GET /api/v1/debug/workspace
 *
 * Returns the workspace context for the authenticated API key
 * and details about files in storage
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const GET = withApiAuth(async (_, { context }) => {
  const { wsId } = context;

  // Query storage.objects table directly to see what files exist
  // Use admin client to bypass RLS policies
  const supabase = await createAdminClient();

  // Try multiple query patterns to find files
  const queries = [
    supabase
      .schema('storage')
      .from('objects')
      .select('name, bucket_id, metadata')
      .eq('bucket_id', 'workspaces')
      .ilike('name', `${wsId}/%`)  // With slash
      .limit(20),
    supabase
      .schema('storage')
      .from('objects')
      .select('name, bucket_id, metadata')
      .eq('bucket_id', 'workspaces')
      .ilike('name', `${wsId}%`)  // Without slash
      .limit(20),
    supabase
      .schema('storage')
      .from('objects')
      .select('name, bucket_id, metadata')
      .eq('bucket_id', 'workspaces')
      .limit(100), // Get all files to see everything
  ];

  const [withSlash, withoutSlash, allFiles] = await Promise.all(queries);

  const { data: storageObjects, error: storageError } = withSlash;
  const { data: storageObjectsNoSlash } = withoutSlash;
  const { data: allStorageFiles } = allFiles;

  return NextResponse.json({
    context: {
      wsId: context.wsId,
      keyId: context.keyId,
      roleId: context.roleId,
      permissions: context.permissions,
    },
    storageDebug: {
      withSlash: {
        query: `${wsId}/%`,
        count: storageObjects?.length || 0,
        objects: storageObjects || [],
      },
      withoutSlash: {
        query: `${wsId}%`,
        count: storageObjectsNoSlash?.length || 0,
        objects: storageObjectsNoSlash || [],
      },
      allFiles: {
        count: allStorageFiles?.length || 0,
        objects: allStorageFiles || [],
      },
      error: storageError,
    },
  });
});
