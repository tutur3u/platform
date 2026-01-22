import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  AffectedRecords,
  MergeResult,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Interface for RPC response typing (Supabase RPC returns Json type)
interface MergeRpcResponse {
  success: boolean;
  error?: string;
  merged_user_id: string;
  deleted_user_id: string;
  updates: AffectedRecords;
  fields_from_deleted: string[];
  balance_strategy: 'keep' | 'add';
}

const FieldStrategySchema = z
  .record(z.string(), z.enum(['keep', 'delete']))
  .optional();
const BalanceStrategySchema = z.enum(['keep', 'add']).default('keep');

const RequestBodySchema = z.object({
  keepUserId: z.string().uuid(),
  deleteUserId: z.string().uuid(),
  fieldStrategy: FieldStrategySchema,
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

    const { keepUserId, deleteUserId, fieldStrategy, balanceStrategy } =
      validatedBody.data;

    // Verify both users belong to this workspace
    const { data: keepUser, error: keepUserError } = await supabase
      .from('workspace_users')
      .select('ws_id')
      .eq('id', keepUserId)
      .eq('deleted', false)
      .single();

    if (keepUserError || !keepUser) {
      return NextResponse.json(
        { message: 'Keep user not found' },
        { status: 404 }
      );
    }

    if (keepUser.ws_id !== wsId) {
      return NextResponse.json(
        { message: 'Keep user does not belong to this workspace' },
        { status: 400 }
      );
    }

    const { data: deleteUser, error: deleteUserError } = await supabase
      .from('workspace_users')
      .select('ws_id')
      .eq('id', deleteUserId)
      .eq('deleted', false)
      .single();

    if (deleteUserError || !deleteUser) {
      return NextResponse.json(
        { message: 'Delete user not found' },
        { status: 404 }
      );
    }

    if (deleteUser.ws_id !== wsId) {
      return NextResponse.json(
        { message: 'Delete user does not belong to this workspace' },
        { status: 400 }
      );
    }

    // Call the RPC function
    const { data, error } = await supabase.rpc('merge_workspace_users', {
      keep_user_id: keepUserId,
      delete_user_id: deleteUserId,
      field_strategy: fieldStrategy || {},
      balance_strategy: balanceStrategy,
    });

    if (error) {
      console.error('Error executing merge:', error);
      return NextResponse.json(
        { message: 'Error executing merge' },
        { status: 500 }
      );
    }

    // Type assertion for RPC response
    const result = data as unknown as MergeRpcResponse;

    // Check for RPC-level errors
    if (!result || !result.success) {
      return NextResponse.json(
        { success: false, error: result?.error || 'Unknown error' },
        { status: 400 }
      );
    }

    const response: MergeResult = {
      success: true,
      mergedUserId: result.merged_user_id,
      deletedUserId: result.deleted_user_id,
      updates: result.updates || {},
      fieldsFromDeleted: result.fields_from_deleted || [],
      balanceStrategy: result.balance_strategy,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in merge API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
