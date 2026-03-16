import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  kind: z.enum(['reports', 'posts']),
  reportId: z.string().optional(),
  postId: z.string().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const sbAdmin = await createAdminClient();

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    const canApproveReports = containsPermission('approve_reports');
    const canApprovePosts = containsPermission('approve_posts');

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

    const { kind, reportId, postId } = parsed.data;

    if (kind === 'reports') {
      if (!canApproveReports) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
      }
      if (!reportId) {
        return NextResponse.json(
          { message: 'Report ID is required' },
          { status: 400 }
        );
      }

      const { data, error } = await sbAdmin
        .from('external_user_monthly_report_logs')
        .select(
          'id, report_id, title, content, feedback, score, scores, created_at, report_approval_status, approved_at'
        )
        .eq('report_id', reportId)
        .eq('report_approval_status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json(data);
    } else {
      // Posts
      if (!canApprovePosts) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
      }
      if (!postId) {
        return NextResponse.json(
          { message: 'Post ID is required' },
          { status: 400 }
        );
      }

      const { data, error } = await sbAdmin
        .from('user_group_post_logs')
        .select('*')
        .eq('post_id', postId)
        .eq('post_approval_status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error('Error in approvals logs GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
