import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  DuplicateCluster,
  DuplicateDetectionResponse,
  DuplicateUser,
} from '@tuturuuu/types/primitives';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

interface RawDuplicateRow {
  cluster_id: number;
  match_reason: 'email' | 'phone' | 'both';
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_linked: boolean;
  linked_platform_user_id: string | null;
  created_at: string;
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);

    // Check permissions - require view_users_private_info to access email/phone
    const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
    if (withoutPermission('view_users_private_info')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to detect duplicate users' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Call the RPC function to detect duplicates
    // Note: The RPC function is defined in migration but types are generated after migration is applied
    const { data: rawData, error } = await (supabase.rpc as CallableFunction)(
      'detect_duplicate_workspace_users',
      {
        _ws_id: wsId,
      }
    );

    if (error) {
      console.error('Error detecting duplicate users:', error);
      return NextResponse.json(
        { message: 'Error detecting duplicate users', error: error.message },
        { status: 500 }
      );
    }

    // Transform raw data into clustered format
    const clusters = transformToClusters(rawData as RawDuplicateRow[]);

    const response: DuplicateDetectionResponse = {
      clusters,
      totalDuplicates: (rawData as RawDuplicateRow[])?.length ?? 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error detecting duplicate users:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Transforms raw duplicate rows from the RPC into clustered format
 */
function transformToClusters(rows: RawDuplicateRow[]): DuplicateCluster[] {
  if (!rows || rows.length === 0) {
    return [];
  }

  const clusterMap = new Map<number, DuplicateCluster>();

  for (const row of rows) {
    const user: DuplicateUser = {
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      isLinked: row.is_linked,
      linkedPlatformUserId: row.linked_platform_user_id,
      createdAt: row.created_at,
    };

    const existing = clusterMap.get(row.cluster_id);
    if (existing) {
      existing.users.push(user);
    } else {
      clusterMap.set(row.cluster_id, {
        clusterId: row.cluster_id,
        matchReason: row.match_reason,
        users: [user],
        suggestedTargetId: '', // Will be set after all users are added
      });
    }
  }

  // Set suggested target for each cluster (first user - linked or oldest)
  const clusters = Array.from(clusterMap.values());
  for (const cluster of clusters) {
    // Users are already ordered by the RPC: linked first, then by created_at
    if (cluster.users.length > 0) {
      cluster.suggestedTargetId = cluster.users[0]!.id;
    }
  }

  return clusters;
}
