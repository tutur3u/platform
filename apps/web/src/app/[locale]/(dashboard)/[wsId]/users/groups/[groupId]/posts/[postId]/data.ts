import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroupPost } from '@tuturuuu/types/db';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { notFound } from 'next/navigation';
import type { GroupPostRecipientRow, GroupPostStatusSummaryRow } from './types';

export interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

type PostStatusRpcArgs = {
  p_group_id: string;
  p_post_id: string;
  p_ws_id: string;
};

type RecipientRowsRpcArgs = PostStatusRpcArgs & {
  p_q?: string;
};

type PrivateUserGroupPostRpc = {
  (
    fn: 'get_user_group_post_status_summary',
    args: PostStatusRpcArgs
  ): Promise<{ data: GroupPostStatusSummaryRow[] | null; error: unknown }>;
  (
    fn: 'get_user_group_post_recipient_rows',
    args: RecipientRowsRpcArgs
  ): Promise<{ data: GroupPostRecipientRow[] | null; error: unknown }>;
};

type PrivateUserGroupPostClient = {
  rpc: PrivateUserGroupPostRpc;
};

export async function getPostData(
  wsId: string,
  groupId: string,
  postId: string
): Promise<UserGroupPost> {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select(`
      *,
      workspace_user_groups!inner(ws_id)
    `)
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data as UserGroupPost;
}

export async function getGroupData(wsId: string, groupId: string) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

export async function getPostStatus(
  wsId: string,
  groupId: string,
  postId: string
) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema(
    'private'
  ) as unknown as PrivateUserGroupPostClient;
  const { data, error } = await privateDb.rpc(
    'get_user_group_post_status_summary',
    {
      p_group_id: groupId,
      p_post_id: postId,
      p_ws_id: wsId,
    }
  );

  if (error) {
    throw error;
  }

  const summary = data?.[0] as GroupPostStatusSummaryRow | undefined;

  return {
    approvals: {
      approved: Number(summary?.approved_count ?? 0),
      pending: Number(summary?.pending_approval_count ?? 0),
      rejected: Number(summary?.rejected_count ?? 0),
    },
    completed: Number(summary?.completed_count ?? 0),
    count: Number(summary?.total_count ?? 0),
    delivery_failed: Number(summary?.delivery_failed_count ?? 0),
    incomplete: Number(summary?.incomplete_count ?? 0),
    missing_check: Number(summary?.missing_check_count ?? 0),
    processing: Number(summary?.processing_stage_count ?? 0),
    queued: Number(summary?.queued_stage_count ?? 0),
    sent: Number(summary?.sent_stage_count ?? 0),
    undeliverable: Number(summary?.undeliverable_count ?? 0),
  };
}

export async function getRecipientRows(
  wsId: string,
  groupId: string,
  postId: string,
  { q }: SearchParams = {}
) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema(
    'private'
  ) as unknown as PrivateUserGroupPostClient;
  const { data, error } = await privateDb.rpc(
    'get_user_group_post_recipient_rows',
    {
      p_group_id: groupId,
      p_post_id: postId,
      p_q: q ?? undefined,
      p_ws_id: wsId,
    }
  );

  if (error) {
    throw error;
  }

  return (data ?? []).map((recipient) => ({
    ...recipient,
    user_avatar_url: normalizeAvatarImageSrc(recipient.user_avatar_url) ?? null,
  })) as GroupPostRecipientRow[];
}
