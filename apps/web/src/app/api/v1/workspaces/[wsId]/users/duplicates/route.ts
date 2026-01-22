import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  DuplicateGroup,
  DuplicatesResponse,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const QueryParamsSchema = z.object({
  type: z.enum(['email', 'phone', 'all']).default('all'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    // Resolve workspace ID
    const workspace = await getWorkspace(id);
    const wsId = workspace.id;

    // Check permissions - need view_users_private_info to see email/phone
    const { containsPermission } = await getPermissions({ wsId });
    if (!containsPermission('view_users_private_info')) {
      return NextResponse.json(
        { message: 'Permission denied: view_users_private_info required' },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryParams = QueryParamsSchema.parse({
      type: searchParams.get('type') || 'all',
    });

    // Call the RPC function
    const { data, error } = await supabase.rpc(
      'find_duplicate_workspace_users',
      {
        target_ws_id: wsId,
        duplicate_type: queryParams.type,
      }
    );

    if (error) {
      console.error('Error finding duplicates:', error);
      return NextResponse.json(
        { message: 'Error finding duplicate users' },
        { status: 500 }
      );
    }

    // Transform the data into the expected format
    const duplicates: DuplicateGroup[] = (data || []).map((row) => ({
      duplicateKey: row.duplicate_key,
      duplicateField: row.duplicate_field as 'email' | 'phone',
      userIds: row.user_ids,
      users: row.users as unknown as WorkspaceUser[],
    }));

    const emailGroups = duplicates.filter(
      (d) => d.duplicateField === 'email'
    ).length;
    const phoneGroups = duplicates.filter(
      (d) => d.duplicateField === 'phone'
    ).length;

    const response: DuplicatesResponse = {
      duplicates,
      totalGroups: duplicates.length,
      emailGroups,
      phoneGroups,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in duplicates API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
