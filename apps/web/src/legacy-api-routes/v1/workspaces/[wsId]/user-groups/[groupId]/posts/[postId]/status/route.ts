import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import type { GroupPostStatusSummaryRow } from '@/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/posts/[postId]/types';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
}

type PostStatusRpcArgs = {
  p_group_id: string;
  p_post_id: string;
  p_ws_id: string;
};

type PostStatusRpc = (
  fn: 'get_user_group_post_status_summary',
  args: PostStatusRpcArgs
) => Promise<{ data: GroupPostStatusSummaryRow[] | null; error: unknown }>;

type PostStatusRpcClient = {
  rpc: PostStatusRpc;
};

export async function GET(req: Request, { params }: Params) {
  const { wsId: id, groupId, postId } = await params;
  const wsId = await normalizeWorkspaceId(id);

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
  const privateDb = sbAdmin.schema('private') as unknown as PostStatusRpcClient;
  const { data, error } = await privateDb.rpc(
    'get_user_group_post_status_summary',
    {
      p_group_id: groupId,
      p_post_id: postId,
      p_ws_id: wsId,
    }
  );

  if (error) {
    console.error('Error fetching group post status summary', {
      error,
      groupId,
      postId,
      wsId,
    });
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
    undeliverable: Number(summary?.undeliverable_count ?? 0),
  });
}
