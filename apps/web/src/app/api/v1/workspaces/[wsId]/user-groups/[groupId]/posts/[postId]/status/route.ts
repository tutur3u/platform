import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/db';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
}

type GroupPostStatusSummaryRow =
  Database['public']['Functions']['get_user_group_post_status_summary']['Returns'][number];

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId, postId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin.rpc(
    'get_user_group_post_status_summary',
    {
      p_group_id: groupId,
      p_post_id: postId,
      p_ws_id: wsId,
    }
  );

  if (error) {
    console.error('Error fetching group post status summary:', error);
    return NextResponse.json(
      { message: 'Error fetching group post status summary' },
      { status: 500 }
    );
  }

  const summary = data?.[0] as GroupPostStatusSummaryRow | undefined;
  const queue = {
    blocked: Number(summary?.blocked_count ?? 0),
    cancelled: Number(summary?.cancelled_count ?? 0),
    failed: Number(summary?.failed_count ?? 0),
    processing: Number(summary?.processing_count ?? 0),
    queued: Number(summary?.queued_count ?? 0),
    sent: Number(summary?.sent_count ?? 0),
    skipped: Number(summary?.queue_skipped_count ?? 0),
  };

  return NextResponse.json({
    approved_awaiting_delivery: Number(
      summary?.approved_awaiting_delivery_count ?? 0
    ),
    can_remove_approval: Number(summary?.sent_stage_count ?? 0) === 0,
    checked: Number(summary?.completed_count ?? 0),
    count: Number(summary?.total_count ?? 0),
    failed: Number(summary?.incomplete_count ?? 0),
    missing_check: Number(summary?.missing_check_count ?? 0),
    queue,
    sent: Number(summary?.sent_stage_count ?? 0),
    tentative: Number(summary?.missing_check_count ?? 0),
  });
}
