import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  title: z.string(),
  status: z.enum(['ALL', 'APPROVED']).default('ALL'),
});

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { groupId, wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const { searchParams } = new URL(request.url);
    const parsed = SearchParamsSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, status } = parsed.data;
    const permissions = await getPermissions({ wsId, request });

    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('view_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    let query = sbAdmin
      .from('external_user_monthly_reports')
      .select(
        '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name), ...workspace_user_groups(group_name:name)'
      )
      .eq('group_id', groupId)
      .eq('user.ws_id', wsId)
      .eq('title', title);

    if (status === 'APPROVED') {
      query = query.eq('report_approval_status', 'APPROVED');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error in bulk export fetch:', error);
      return NextResponse.json(
        { message: 'Error fetching reports' },
        { status: 500 }
      );
    }

    const mappedReports = (data || []).map((raw) => {
      const user = raw.user as unknown as
        | { full_name: string | null }
        | { full_name: string | null }[];
      const userName = Array.isArray(user)
        ? user?.[0]?.full_name
        : user?.full_name;

      const creator = raw.creator as unknown as
        | { full_name: string | null }
        | { full_name: string | null }[];
      const creatorName = Array.isArray(creator)
        ? creator?.[0]?.full_name
        : creator?.full_name;

      return {
        ...raw,
        user_name: userName,
        creator_name: creatorName,
        group_name: raw.group_name,
      };
    });

    return NextResponse.json(mappedReports);
  } catch (error) {
    console.error('Error in bulk export API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
