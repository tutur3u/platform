import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  MergeUsersRequest,
  PhasedMergeResult,
  PhaseResult,
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
  startPhase: z.number().int().min(1).max(5).optional(),
});

interface RpcCollisionDetail {
  table: string;
  deleted_count: number;
  pk_column: string;
  deleted_pk_values: string[];
}

interface RpcPhasedMergeResult {
  success: boolean;
  error?: string;
  completed_phase: number;
  next_phase?: number;
  partial: boolean;
  source_user_id?: string;
  target_user_id?: string;
  migrated_tables?: string[];
  collision_tables?: string[];
  collision_details?: RpcCollisionDetail[];
  custom_fields_merged?: number;
  source_platform_user_id?: string;
  target_platform_user_id?: string;
  phase_results?: PhaseResult[];
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
    const body = (await req.json()) as MergeUsersRequest & {
      startPhase?: number;
    };
    const parsed = MergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { sourceId, targetId, startPhase } = parsed.data;

    // Prevent self-merge
    if (sourceId === targetId) {
      return NextResponse.json(
        { message: 'Cannot merge user with itself' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Use phased merge if startPhase is provided, otherwise use the phased function starting at phase 1
    // The phased approach is more resilient to timeouts for large data sets
    const { data, error } = await (supabase.rpc as CallableFunction)(
      'merge_workspace_users_phased',
      {
        _source_id: sourceId,
        _target_id: targetId,
        _ws_id: wsId,
        _start_phase: startPhase ?? 1,
      }
    );

    if (error) {
      // Check for statement timeout error
      if (error.code === '57014') {
        console.error('Merge timed out:', error);
        return NextResponse.json(
          {
            message:
              'Merge operation timed out. Try resuming from a later phase.',
            error: error.message,
            partial: true,
            nextPhase: startPhase ?? 1,
          },
          { status: 408 }
        );
      }
      console.error('Error merging users:', error);
      return NextResponse.json(
        { message: 'Error merging users', error: error.message },
        { status: 500 }
      );
    }

    const rpcResult = data as RpcPhasedMergeResult;

    // Check if RPC returned an error
    if (!rpcResult.success) {
      // If partial, return with retry information
      if (rpcResult.partial) {
        return NextResponse.json(
          {
            message: rpcResult.error || 'Merge partially completed',
            partial: true,
            completedPhase: rpcResult.completed_phase,
            nextPhase: rpcResult.next_phase,
            phaseResults: rpcResult.phase_results,
            sourcePlatformUserId: rpcResult.source_platform_user_id,
            targetPlatformUserId: rpcResult.target_platform_user_id,
          },
          { status: 206 }
        );
      }
      return NextResponse.json(
        { message: rpcResult.error || 'Merge failed' },
        { status: 400 }
      );
    }

    // Return full result for phased merge
    const result: PhasedMergeResult = {
      success: rpcResult.success,
      sourceUserId: rpcResult.source_user_id ?? sourceId,
      targetUserId: rpcResult.target_user_id ?? targetId,
      migratedTables: rpcResult.migrated_tables ?? [],
      collisionTables: rpcResult.collision_tables ?? [],
      collisionDetails: rpcResult.collision_details,
      customFieldsMerged: rpcResult.custom_fields_merged ?? 0,
      sourcePlatformUserId: rpcResult.source_platform_user_id,
      targetPlatformUserId: rpcResult.target_platform_user_id,
      completedPhase: rpcResult.completed_phase,
      nextPhase: rpcResult.next_phase,
      partial: rpcResult.partial,
      phaseResults: rpcResult.phase_results,
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
