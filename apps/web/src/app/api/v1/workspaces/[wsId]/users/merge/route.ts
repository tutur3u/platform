import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  MergeResult,
  MergeUsersRequest,
} from '@tuturuuu/types/primitives';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const MergeRequestSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

interface RpcMergeResult {
  success: boolean;
  error?: string;
  source_user_id: string;
  target_user_id: string;
  migrated_tables: string[];
  collision_tables: string[];
  custom_fields_merged: number;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);

    // Check permissions - require both delete_users and update_users
    const { withoutPermission } = await getPermissions({ wsId });
    if (
      withoutPermission('delete_users') ||
      withoutPermission('update_users')
    ) {
      return NextResponse.json(
        { message: 'Insufficient permissions to merge users' },
        { status: 403 }
      );
    }

    // Validate request body
    const body = (await req.json()) as MergeUsersRequest;
    const parsed = MergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { sourceId, targetId } = parsed.data;

    // Prevent self-merge
    if (sourceId === targetId) {
      return NextResponse.json(
        { message: 'Cannot merge user with itself' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call the RPC function to merge users
    // Note: The RPC function is defined in migration but types are generated after migration is applied
    const { data, error } = await (supabase.rpc as CallableFunction)(
      'merge_workspace_users',
      {
        _source_id: sourceId,
        _target_id: targetId,
        _ws_id: wsId,
      }
    );

    if (error) {
      console.error('Error merging users:', error);
      return NextResponse.json(
        { message: 'Error merging users', error: error.message },
        { status: 500 }
      );
    }

    const rpcResult = data as RpcMergeResult;

    // Check if RPC returned an error
    if (!rpcResult.success) {
      return NextResponse.json(
        { message: rpcResult.error || 'Merge failed' },
        { status: 400 }
      );
    }

    const result: MergeResult = {
      success: rpcResult.success,
      sourceUserId: rpcResult.source_user_id,
      targetUserId: rpcResult.target_user_id,
      migratedTables: rpcResult.migrated_tables,
      collisionTables: rpcResult.collision_tables,
      customFieldsMerged: rpcResult.custom_fields_merged,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error merging users:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
