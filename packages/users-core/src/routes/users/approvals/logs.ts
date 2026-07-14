import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ApprovalRouteActor, ApprovalRouteParams } from './shared';

const SearchParamsSchema = z.object({
  kind: z.enum(['reports', 'posts']),
  postId: z.string().optional(),
  reportId: z.string().optional(),
});

export async function handleGetApprovalLogsRequest(
  request: Request,
  { params }: ApprovalRouteParams,
  actor: ApprovalRouteActor
) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const permissions = await getPermissions({ request, user: actor, wsId });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = SearchParamsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { kind, postId, reportId } = parsed.data;
    const sbAdmin = await createAdminClient({ noCookie: true });
    const privateDb = sbAdmin.schema('private');

    if (kind === 'reports') {
      if (!permissions.containsPermission('approve_reports')) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
      }
      if (!reportId) {
        return NextResponse.json(
          { message: 'Report ID is required' },
          { status: 400 }
        );
      }
      const { data, error } = await privateDb
        .from('external_user_monthly_report_logs_workspace_view')
        .select(
          'id, report_id, title, content, feedback, score, scores, created_at, report_approval_status, approved_at'
        )
        .eq('report_id', reportId)
        .eq('user_ws_id', wsId)
        .eq('report_approval_status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (!permissions.containsPermission('approve_posts')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }
    if (!postId) {
      return NextResponse.json(
        { message: 'Post ID is required' },
        { status: 400 }
      );
    }
    const { data, error } = await privateDb
      .from('user_group_post_logs')
      .select('*')
      .eq('post_id', postId)
      .eq('post_approval_status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Contacts approval logs GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
