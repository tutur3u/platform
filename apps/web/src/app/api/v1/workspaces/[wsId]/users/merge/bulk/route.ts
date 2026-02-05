import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  BulkMergeUsersRequest,
  BulkMergeUsersResponse,
  MergeResult,
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

const MergeItemSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

const BulkMergeRequestSchema = z.object({
  merges: z.array(MergeItemSchema).min(1).max(100), // Limit to 100 merges at a time
});

interface RpcCollisionDetail {
  table: string;
  deleted_count: number;
  pk_column: string;
  deleted_pk_values: string[];
}

interface RpcMergeResult {
  success: boolean;
  error?: string;
  source_user_id: string;
  target_user_id: string;
  migrated_tables: string[];
  collision_tables: string[];
  collision_details?: RpcCollisionDetail[];
  custom_fields_merged: number;
  source_platform_user_id?: string;
  target_platform_user_id?: string;
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
    const body = (await req.json()) as BulkMergeUsersRequest;
    const parsed = BulkMergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { merges } = parsed.data;

    // Validate no self-merges
    for (const merge of merges) {
      if (merge.sourceId === merge.targetId) {
        return NextResponse.json(
          { message: 'Cannot merge user with itself' },
          { status: 400 }
        );
      }
    }

    const supabase = await createClient();
    const results: MergeResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process merges sequentially to avoid race conditions
    for (const merge of merges) {
      try {
        // Note: The RPC function is defined in migration but types are generated after migration is applied
        const { data, error } = await (supabase.rpc as CallableFunction)(
          'merge_workspace_users',
          {
            _source_id: merge.sourceId,
            _target_id: merge.targetId,
            _ws_id: wsId,
          }
        );

        if (error) {
          console.error(
            `Error merging users ${merge.sourceId} -> ${merge.targetId}:`,
            error
          );
          results.push({
            success: false,
            error: error.message,
            sourceUserId: merge.sourceId,
            targetUserId: merge.targetId,
            migratedTables: [],
            collisionTables: [],
            customFieldsMerged: 0,
          });
          failCount++;
          continue;
        }

        const rpcResult = data as RpcMergeResult;

        if (!rpcResult.success) {
          results.push({
            success: false,
            error: rpcResult.error,
            sourceUserId: merge.sourceId,
            targetUserId: merge.targetId,
            migratedTables: [],
            collisionTables: [],
            customFieldsMerged: 0,
          });
          failCount++;
          continue;
        }

        results.push({
          success: rpcResult.success,
          sourceUserId: rpcResult.source_user_id,
          targetUserId: rpcResult.target_user_id,
          migratedTables: rpcResult.migrated_tables,
          collisionTables: rpcResult.collision_tables,
          collisionDetails: rpcResult.collision_details,
          customFieldsMerged: rpcResult.custom_fields_merged,
          sourcePlatformUserId: rpcResult.source_platform_user_id,
          targetPlatformUserId: rpcResult.target_platform_user_id,
        });
        successCount++;
      } catch (mergeError) {
        console.error(
          `Error processing merge ${merge.sourceId} -> ${merge.targetId}:`,
          mergeError
        );
        results.push({
          success: false,
          error:
            mergeError instanceof Error ? mergeError.message : 'Unknown error',
          sourceUserId: merge.sourceId,
          targetUserId: merge.targetId,
          migratedTables: [],
          collisionTables: [],
          customFieldsMerged: 0,
        });
        failCount++;
      }
    }

    const response: BulkMergeUsersResponse = {
      results,
      successCount,
      failCount,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in bulk merge:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
