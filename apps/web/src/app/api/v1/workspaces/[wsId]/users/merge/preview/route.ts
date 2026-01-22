import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  AffectedRecords,
  MergePreview,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Interface for RPC response typing (Supabase RPC returns Json type)
interface PreviewMergeRpcResponse {
  error?: string;
  keep_user: WorkspaceUser;
  delete_user: WorkspaceUser;
  affected_records: AffectedRecords;
  warnings: string[];
}

const RequestBodySchema = z.object({
  keepUserId: z.string().uuid(),
  deleteUserId: z.string().uuid(),
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

    const { keepUserId, deleteUserId } = validatedBody.data;

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
    const { data, error } = await supabase.rpc('preview_workspace_user_merge', {
      keep_user_id: keepUserId,
      delete_user_id: deleteUserId,
    });

    if (error) {
      console.error('Error previewing merge:', error);
      return NextResponse.json(
        { message: 'Error previewing merge' },
        { status: 500 }
      );
    }

    // Type assertion for RPC response
    const result = data as unknown as PreviewMergeRpcResponse;

    // Check for RPC-level errors
    if (!result || result.error) {
      return NextResponse.json(
        { message: result?.error || 'Unknown error' },
        { status: 400 }
      );
    }

    // Calculate total affected records
    const affectedRecords = result.affected_records;
    let totalAffectedRecords = 0;
    for (const table of Object.values(affectedRecords)) {
      for (const count of Object.values(table)) {
        totalAffectedRecords += count as number;
      }
    }

    const response: MergePreview = {
      keepUser: result.keep_user,
      deleteUser: result.delete_user,
      affectedRecords,
      totalAffectedRecords,
      warnings: result.warnings || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in merge preview API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
