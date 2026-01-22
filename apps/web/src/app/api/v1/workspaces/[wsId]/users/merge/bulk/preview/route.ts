import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  AffectedRecords,
  BulkMergePairPreview,
  BulkMergePreview,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Interface for RPC response typing (Supabase RPC returns Json type)
interface BulkPreviewRpcResponse {
  error?: string;
  keep_user: WorkspaceUser & { ws_id: string };
  delete_user: WorkspaceUser & { ws_id: string };
  affected_records: AffectedRecords;
  warnings: string[];
}

const BulkMergePairSchema = z.object({
  keepUserId: z.string().uuid(),
  deleteUserId: z.string().uuid(),
});

const RequestBodySchema = z.object({
  pairs: z.array(BulkMergePairSchema).min(1).max(100),
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

    const { pairs } = validatedBody.data;

    // Preview each pair
    const pairPreviews: BulkMergePairPreview[] = [];
    const allWarnings: string[] = [];
    let totalAffectedRecords = 0;

    for (const pair of pairs) {
      const { data, error } = await supabase.rpc(
        'preview_workspace_user_merge',
        {
          keep_user_id: pair.keepUserId,
          delete_user_id: pair.deleteUserId,
        }
      );

      if (error) {
        console.error('Error previewing merge for pair:', pair, error);
        continue;
      }

      // Type assertion for RPC response
      const result = data as unknown as BulkPreviewRpcResponse;

      if (!result || result.error) {
        allWarnings.push(
          `${pair.keepUserId}: ${result?.error || 'Unknown error'}`
        );
        continue;
      }

      // Verify both users belong to this workspace
      if (
        result.keep_user?.ws_id !== wsId ||
        result.delete_user?.ws_id !== wsId
      ) {
        allWarnings.push(
          `Users ${pair.keepUserId} and ${pair.deleteUserId} don't both belong to this workspace`
        );
        continue;
      }

      // Calculate affected records for this pair
      const affectedRecords = result.affected_records;
      let pairAffectedRecords = 0;
      for (const table of Object.values(affectedRecords)) {
        for (const count of Object.values(table)) {
          pairAffectedRecords += count as number;
        }
      }

      pairPreviews.push({
        keepUser: result.keep_user,
        deleteUser: result.delete_user,
        affectedRecords: pairAffectedRecords,
      });

      totalAffectedRecords += pairAffectedRecords;

      // Collect warnings
      if (result.warnings && result.warnings.length > 0) {
        allWarnings.push(...result.warnings);
      }
    }

    const response: BulkMergePreview = {
      pairs: pairPreviews,
      totalAffectedRecords,
      warnings: allWarnings,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in bulk merge preview API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
