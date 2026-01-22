import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  BulkMergePairResult,
  BulkMergeResult,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Interface for RPC response typing (Supabase RPC returns Json type)
interface BulkMergeRpcResponse {
  success: boolean;
  error?: string;
}

const BulkMergePairSchema = z.object({
  keepUserId: z.string().uuid(),
  deleteUserId: z.string().uuid(),
});

const BalanceStrategySchema = z.enum(['keep', 'add']).default('keep');

const RequestBodySchema = z.object({
  pairs: z.array(BulkMergePairSchema).min(1).max(100),
  balanceStrategy: BalanceStrategySchema,
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    // Resolve workspace ID
    const workspace = await getWorkspace(id);
    const wsId = workspace.id;

    // Check permissions - need merge_users permission
    const { containsPermission } = await getPermissions({ wsId });
    if (!containsPermission('merge_users')) {
      return NextResponse.json(
        { message: 'Permission denied: merge_users required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const validatedBody = RequestBodySchema.safeParse(body);

    if (!validatedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: validatedBody.error.issues },
        { status: 400 }
      );
    }

    const { pairs, balanceStrategy } = validatedBody.data;

    // Execute each merge
    const results: BulkMergePairResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const pair of pairs) {
      // Verify users belong to this workspace before merging
      const { data: keepUser, error: keepUserError } = await supabase
        .from('workspace_users')
        .select('ws_id')
        .eq('id', pair.keepUserId)
        .eq('deleted', false)
        .single();

      if (keepUserError || !keepUser || keepUser.ws_id !== wsId) {
        results.push({
          keepUserId: pair.keepUserId,
          deleteUserId: pair.deleteUserId,
          success: false,
          error: 'Keep user not found or does not belong to this workspace',
        });
        failureCount++;
        continue;
      }

      const { data: deleteUser, error: deleteUserError } = await supabase
        .from('workspace_users')
        .select('ws_id')
        .eq('id', pair.deleteUserId)
        .eq('deleted', false)
        .single();

      if (deleteUserError || !deleteUser || deleteUser.ws_id !== wsId) {
        results.push({
          keepUserId: pair.keepUserId,
          deleteUserId: pair.deleteUserId,
          success: false,
          error: 'Delete user not found or does not belong to this workspace',
        });
        failureCount++;
        continue;
      }

      // Execute the merge
      const { data, error } = await supabase.rpc('merge_workspace_users', {
        keep_user_id: pair.keepUserId,
        delete_user_id: pair.deleteUserId,
        field_strategy: {},
        balance_strategy: balanceStrategy,
      });

      if (error) {
        console.error('Error executing merge for pair:', pair, error);
        results.push({
          keepUserId: pair.keepUserId,
          deleteUserId: pair.deleteUserId,
          success: false,
          error: error.message,
        });
        failureCount++;
        continue;
      }

      // Type assertion for RPC response
      const result = data as unknown as BulkMergeRpcResponse;

      if (!result || !result.success) {
        results.push({
          keepUserId: pair.keepUserId,
          deleteUserId: pair.deleteUserId,
          success: false,
          error: result?.error,
        });
        failureCount++;
        continue;
      }

      results.push({
        keepUserId: pair.keepUserId,
        deleteUserId: pair.deleteUserId,
        success: true,
      });
      successCount++;
    }

    const response: BulkMergeResult = {
      success: failureCount === 0,
      results,
      successCount,
      failureCount,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in bulk merge API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
