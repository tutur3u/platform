import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type {
  Database,
  GroupPostCheck,
  WorkspaceUser,
} from '@tuturuuu/types/db';
import {
  buildPostEmailAgeSkipReason,
  getPostEmailMaxAgeCutoff,
  isPostEmailAgeSkipReason,
  POST_EMAIL_QUEUE_TABLE,
} from './constants';
import {
  filterAgeSkippedRows,
  filterRowsByRecentPosts,
  getEligibleReenqueuePairIds,
  getQueueIdsForOldPosts,
  getQueueIdsToReenqueue,
  getSentPairIds,
} from './logic';
import type {
  EligibleRecipient,
  EligibleRecipientCheckRow,
  ExistingQueueState,
  OldApprovedCheckRow,
  OrphanedApprovedCheckRow,
  PostEmailQueueRow,
  PostEmailQueueUpsertRow,
  PostScopeRow,
  QueueIdPostRow,
  QueueIdPostUserRow,
  QueueSenderRow,
  QueueSkipTarget,
  QueueSkipUpdate,
  SentReceiverRow,
  WorkspaceUserGroupRow,
  WorkspaceUserLinkedUserRow,
} from './types';
import { chunkArray, isValidEmailAddress } from './utils';

type CheckEligibilityRow = Pick<
  GroupPostCheck,
  'post_id' | 'user_id' | 'is_completed' | 'approval_status'
> & {
  user: Pick<WorkspaceUser, 'id' | 'email' | 'ws_id'> | null;
};

export function getQueueTable(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.from(POST_EMAIL_QUEUE_TABLE);
}

async function getPostIdsOlderThanCutoff(
  sbAdmin: TypedSupabaseClient,
  postIds: string[],
  cutoff: string
): Promise<Set<string>> {
  const oldPostIds = new Set<string>();

  for (const postChunk of chunkArray([...new Set(postIds)])) {
    const { data, error } = await sbAdmin
      .from('user_group_posts')
      .select('id')
      .in('id', postChunk)
      .lt('created_at', cutoff);

    if (error) throw error;

    for (const post of data ?? []) {
      oldPostIds.add(post.id);
    }
  }

  return oldPostIds;
}

async function getPostIdsAtOrAfterCutoff(
  sbAdmin: TypedSupabaseClient,
  postIds: string[],
  cutoff: string
): Promise<Set<string>> {
  const recentPostIds = new Set<string>();

  for (const postChunk of chunkArray([...new Set(postIds)])) {
    const { data, error } = await sbAdmin
      .from('user_group_posts')
      .select('id')
      .in('id', postChunk)
      .gte('created_at', cutoff);

    if (error) throw error;

    for (const post of data ?? []) {
      recentPostIds.add(post.id);
    }
  }

  return recentPostIds;
}

async function updateQueueRowsInChunks(
  sbAdmin: TypedSupabaseClient,
  queueIds: string[],
  patch: Database['public']['Tables']['post_email_queue']['Update'],
  statuses: PostEmailQueueRow['status'][]
): Promise<number> {
  let totalUpdated = 0;

  for (const idChunk of chunkArray([...new Set(queueIds)])) {
    const { data, error } = await getQueueTable(sbAdmin)
      .update(patch)
      .in('id', idChunk)
      .in('status', statuses)
      .select('id');

    if (error) throw error;
    totalUpdated += data?.length ?? 0;
  }

  return totalUpdated;
}

function getWorkspaceGroupValue<K extends 'id' | 'ws_id'>(
  groupValue:
    | Pick<WorkspaceUserGroupRow, K>
    | Array<Pick<WorkspaceUserGroupRow, K>>
    | null,
  key: K
): WorkspaceUserGroupRow[K] | null {
  if (!groupValue) return null;
  return Array.isArray(groupValue)
    ? (groupValue[0]?.[key] ?? null)
    : (groupValue[key] ?? null);
}

export async function getPostEmailQueueRows(
  sbAdmin: TypedSupabaseClient,
  postIds: string[]
): Promise<PostEmailQueueRow[]> {
  if (postIds.length === 0) return [];

  const { data, error } = await getQueueTable(sbAdmin)
    .select('*')
    .in('post_id', postIds);

  if (error) throw error;

  return data ?? [];
}

export async function hasPostEmailBeenSent(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  userId?: string
): Promise<boolean> {
  let sentEmailsQuery = sbAdmin
    .from('sent_emails')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);
  let sentQueueQuery = getQueueTable(sbAdmin)
    .select('id')
    .eq('post_id', postId)
    .eq('status', 'sent');

  if (userId) {
    sentEmailsQuery = sentEmailsQuery.eq('receiver_id', userId);
    sentQueueQuery = sentQueueQuery.eq('user_id', userId);
  }

  const [{ count: sentEmailsCount, error: sentEmailsError }, sentQueueRows] =
    await Promise.all([sentEmailsQuery, sentQueueQuery]);

  if (sentEmailsError) throw sentEmailsError;
  if (sentQueueRows.error) throw sentQueueRows.error;

  return (sentEmailsCount ?? 0) > 0 || (sentQueueRows.data?.length ?? 0) > 0;
}

async function resolveSenderPlatformUserId(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    approvedByWorkspaceUserId,
    fallbackSenderPlatformUserId,
  }: {
    wsId: string;
    approvedByWorkspaceUserId?: string | null;
    fallbackSenderPlatformUserId?: string | null;
  }
): Promise<string | null> {
  if (fallbackSenderPlatformUserId) return fallbackSenderPlatformUserId;
  if (!approvedByWorkspaceUserId) return null;

  const { data, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('ws_id', wsId)
    .eq('virtual_user_id', approvedByWorkspaceUserId)
    .maybeSingle<Pick<WorkspaceUserLinkedUserRow, 'platform_user_id'>>();

  if (error) throw error;

  return data?.platform_user_id ?? null;
}

async function getEligibleRecipients(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    postId,
    userIds,
  }: {
    wsId: string;
    postId: string;
    userIds?: string[];
  }
): Promise<EligibleRecipient[]> {
  let query = sbAdmin
    .from('user_group_post_checks')
    .select(
      'user_id, is_completed, approval_status, approved_by, user:workspace_users!user_id(id, email, ws_id)'
    )
    .eq('post_id', postId)
    .eq('user.ws_id', wsId);

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as EligibleRecipientCheckRow[];
  const filtered = rows
    .filter(
      (row) =>
        row.is_completed !== null &&
        row.approval_status === 'APPROVED' &&
        row.user?.email != null
    )
    .map((row) => ({
      user_id: row.user_id,
      email: row.user!.email,
      approved_by: row.approved_by,
    }));

  const withValidEmail = filtered.filter((row) =>
    isValidEmailAddress(row.email)
  );

  console.log('[getEligibleRecipients]', {
    postId,
    totalRows: rows.length,
    afterApprovalFilter: filtered.length,
    afterEmailFilter: withValidEmail.length,
    sample: withValidEmail.slice(0, 2),
  });

  return withValidEmail;
}

export async function enqueueApprovedPostEmails(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    postId,
    groupId,
    senderPlatformUserId,
    userIds,
  }: {
    wsId: string;
    postId: string;
    groupId?: string;
    senderPlatformUserId?: string | null;
    userIds?: string[];
  }
) {
  const { data: post, error: postError } = await sbAdmin
    .from('user_group_posts')
    .select('id, group_id, created_at, workspace_user_groups!inner(ws_id)')
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .maybeSingle<PostScopeRow>();

  if (postError) throw postError;
  if (!post) return { queued: 0 };
  if (groupId && post.group_id !== groupId) return { queued: 0 };

  if (post.created_at < getPostEmailMaxAgeCutoff()) {
    return { queued: 0 };
  }

  const recipients = await getEligibleRecipients(sbAdmin, {
    wsId,
    postId,
    userIds,
  });

  if (recipients.length === 0) {
    console.log('[enqueueApprovedPostEmails] No eligible recipients', {
      postId,
      wsId,
      userIds,
    });
    return { queued: 0 };
  }

  const recipientIds = recipients.map((recipient) => recipient.user_id);
  const [sentEmailResult, existingQueueResult] = await Promise.all([
    sbAdmin
      .from('sent_emails')
      .select('receiver_id')
      .eq('post_id', postId)
      .in('receiver_id', recipientIds),
    getQueueTable(sbAdmin).select('id, user_id, status').eq('post_id', postId),
  ]);

  if (sentEmailResult.error) throw sentEmailResult.error;
  if (existingQueueResult.error) throw existingQueueResult.error;

  const sentRecipientIds = new Set(
    ((sentEmailResult.data ?? []) as SentReceiverRow[]).map(
      (row) => row.receiver_id
    )
  );
  const existingByUserId = new Map<string, ExistingQueueState>(
    (existingQueueResult.data ?? []).map((row) => [
      row.user_id,
      { id: row.id, user_id: row.user_id, status: row.status },
    ])
  );

  const filteredRecipients = recipients.filter((recipient) => {
    const existing = existingByUserId.get(recipient.user_id);
    if (existing) {
      return (
        existing.status !== 'sent' &&
        existing.status !== 'processing' &&
        existing.status !== 'skipped'
      );
    }
    return !sentRecipientIds.has(recipient.user_id);
  });

  console.log('[enqueueApprovedPostEmails] After dedup filter', {
    postId,
    recipientsCount: recipients.length,
    sentCount: sentRecipientIds.size,
    existingQueueCount: existingByUserId.size,
    filteredCount: filteredRecipients.length,
    existingStatuses: [...existingByUserId.entries()].slice(0, 5),
  });

  if (filteredRecipients.length === 0) return { queued: 0 };

  const upsertRows: PostEmailQueueUpsertRow[] = [];
  for (const recipient of filteredRecipients) {
    const resolvedSenderPlatformUserId = await resolveSenderPlatformUserId(
      sbAdmin,
      {
        wsId,
        approvedByWorkspaceUserId: recipient.approved_by,
        fallbackSenderPlatformUserId: senderPlatformUserId,
      }
    );

    if (!resolvedSenderPlatformUserId) {
      console.log('[enqueueApprovedPostEmails] No sender resolved', {
        postId,
        user_id: recipient.user_id,
        approved_by: recipient.approved_by,
        fallback: senderPlatformUserId,
      });
      continue;
    }

    upsertRows.push({
      ws_id: wsId,
      group_id: post.group_id,
      post_id: postId,
      user_id: recipient.user_id,
      sender_platform_user_id: resolvedSenderPlatformUserId,
      status: 'queued',
      batch_id: null,
      attempt_count: 0,
      last_error: null,
      blocked_reason: null,
      claimed_at: null,
      last_attempt_at: null,
      sent_at: null,
      cancelled_at: null,
      sent_email_id: null,
    });
  }

  console.log('[enqueueApprovedPostEmails] After sender resolve', {
    postId,
    filteredCount: filteredRecipients.length,
    upsertRowsCount: upsertRows.length,
  });

  if (upsertRows.length === 0) return { queued: 0 };

  const { error: upsertError } = await getQueueTable(sbAdmin).upsert(
    upsertRows,
    {
      onConflict: 'post_id,user_id',
    }
  );

  if (upsertError) throw upsertError;

  return { queued: upsertRows.length };
}

export async function cancelQueuedPostEmails(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  userIds?: string[]
) {
  const now = new Date().toISOString();
  let query = getQueueTable(sbAdmin)
    .update({
      status: 'cancelled',
      batch_id: null,
      claimed_at: null,
      cancelled_at: now,
    })
    .eq('post_id', postId)
    .in('status', ['queued', 'failed', 'blocked', 'processing']);

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function autoSkipOldPostEmails(
  sbAdmin: TypedSupabaseClient,
  { wsId }: { wsId?: string } = {}
): Promise<number> {
  const cutoff = getPostEmailMaxAgeCutoff();

  let candidatesQuery = getQueueTable(sbAdmin)
    .select('id, post_id')
    .in('status', ['queued', 'failed', 'blocked']);

  if (wsId) {
    candidatesQuery = candidatesQuery.eq('ws_id', wsId);
  }

  const { data: candidateRowsData, error: candidatesError } =
    await candidatesQuery;
  if (candidatesError) throw candidatesError;

  const candidateRows = (candidateRowsData ?? []) as QueueIdPostRow[];
  if (candidateRows.length === 0) return 0;

  const oldPostIds = await getPostIdsOlderThanCutoff(
    sbAdmin,
    candidateRows.map((row) => row.post_id),
    cutoff
  );
  if (oldPostIds.size === 0) return 0;

  const queueIdsToSkip = getQueueIdsForOldPosts(candidateRows, oldPostIds);

  if (queueIdsToSkip.length === 0) return 0;

  return updateQueueRowsInChunks(
    sbAdmin,
    queueIdsToSkip,
    {
      status: 'skipped',
      batch_id: null,
      claimed_at: null,
      cancelled_at: new Date().toISOString(),
      blocked_reason: null,
      last_error: buildPostEmailAgeSkipReason(),
    },
    ['queued', 'failed', 'blocked']
  );
}

export async function autoSkipOldApprovedPostChecks(
  sbAdmin: TypedSupabaseClient,
  { wsId }: { wsId?: string } = {}
): Promise<number> {
  const cutoff = getPostEmailMaxAgeCutoff();

  let checksQuery = sbAdmin
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, user_group_posts!inner(id, group_id, created_at, workspace_user_groups!inner(id, ws_id))'
    )
    .eq('approval_status', 'APPROVED')
    .not('is_completed', 'is', null)
    .lt('user_group_posts.created_at', cutoff);

  if (wsId) {
    checksQuery = checksQuery.eq(
      'user_group_posts.workspace_user_groups.ws_id',
      wsId
    );
  }

  const { data: oldChecksData, error: checksError } = await checksQuery;
  if (checksError) throw checksError;

  const oldChecks = (oldChecksData ?? []) as OldApprovedCheckRow[];
  if (oldChecks.length === 0) return 0;

  const queueUpdates: Array<QueueSkipUpdate & QueueSkipTarget> = [];
  for (const check of oldChecks) {
    const groupId = getWorkspaceGroupValue(
      check.user_group_posts.workspace_user_groups,
      'id'
    );
    const wsIdForRow = getWorkspaceGroupValue(
      check.user_group_posts.workspace_user_groups,
      'ws_id'
    );

    if (!groupId || !wsIdForRow) continue;

    queueUpdates.push({
      post_id: check.post_id,
      user_id: check.user_id,
      ws_id: wsIdForRow,
      group_id: groupId,
      status: 'skipped',
      batch_id: null,
      claimed_at: null,
      cancelled_at: new Date().toISOString(),
      last_error: buildPostEmailAgeSkipReason(' - auto-skipped'),
    });
  }

  const existingQueueRows = await getQueueTable(sbAdmin)
    .select('post_id, user_id, sender_platform_user_id')
    .in(
      'post_id',
      oldChecks.map((c) => c.post_id)
    )
    .in(
      'user_id',
      oldChecks.map((c) => c.user_id)
    );

  if (existingQueueRows.error) throw existingQueueRows.error;

  const existingByPostUser = new Map<string, string>();
  for (const row of (existingQueueRows.data ?? []) as QueueSenderRow[]) {
    existingByPostUser.set(
      `${row.post_id}:${row.user_id}`,
      row.sender_platform_user_id
    );
  }

  const rowsToUpsert: PostEmailQueueUpsertRow[] = [];
  for (const update of queueUpdates) {
    const senderPlatformUserId = existingByPostUser.get(
      `${update.post_id}:${update.user_id}`
    );
    if (!senderPlatformUserId) continue;

    rowsToUpsert.push({
      ws_id: update.ws_id,
      group_id: update.group_id,
      post_id: update.post_id,
      user_id: update.user_id,
      sender_platform_user_id: senderPlatformUserId,
      status: update.status,
      batch_id: update.batch_id,
      claimed_at: update.claimed_at,
      cancelled_at: update.cancelled_at,
      last_error: update.last_error,
    });
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await getQueueTable(sbAdmin).upsert(
      rowsToUpsert,
      {
        onConflict: 'post_id,user_id',
      }
    );
    if (upsertError) throw upsertError;
  }

  const checkIds = oldChecks.map((c) => c.post_id);
  if (checkIds.length === 0) return 0;

  const { error: updateError } = await sbAdmin
    .from('user_group_post_checks')
    .update({ approval_status: 'SKIPPED' })
    .in('post_id', checkIds)
    .eq('approval_status', 'APPROVED');

  if (updateError) throw updateError;

  return queueUpdates.length;
}

export async function cleanupStaleProcessingRows(
  sbAdmin: TypedSupabaseClient,
  { maxAgeMinutes = 10 }: { maxAgeMinutes?: number } = {}
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await getQueueTable(sbAdmin)
    .update({
      status: 'queued',
      batch_id: null,
      claimed_at: null,
      last_error: null,
      attempt_count: 0,
    })
    .eq('status', 'processing')
    .lt('last_attempt_at', cutoff)
    .select('id');

  if (error) throw error;

  return data?.length ?? 0;
}

export async function autoSkipRejectedPosts(
  sbAdmin: TypedSupabaseClient
): Promise<number> {
  const { data: rejectedChecksData, error } = await sbAdmin
    .from('user_group_post_checks')
    .select('post_id, user_id')
    .eq('approval_status', 'REJECTED');

  if (error) throw error;

  const rejectedChecks = (rejectedChecksData ?? []) as Array<
    Pick<GroupPostCheck, 'post_id' | 'user_id'>
  >;
  if (rejectedChecks.length === 0) return 0;

  const now = new Date().toISOString();
  for (const check of rejectedChecks) {
    await getQueueTable(sbAdmin)
      .update({
        status: 'skipped',
        batch_id: null,
        claimed_at: null,
        cancelled_at: now,
        last_error: 'Post was rejected - auto-skipped',
      })
      .eq('post_id', check.post_id)
      .eq('user_id', check.user_id)
      .eq('status', 'queued');
  }

  return rejectedChecks.length;
}

export async function reconcileOrphanedApprovedPosts(
  sbAdmin: TypedSupabaseClient
): Promise<{ enqueued: number; checked: number }> {
  const cutoff = getPostEmailMaxAgeCutoff();

  const { data: approvedChecksData, error: checksError } = await sbAdmin
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, approved_by, is_completed, user:workspace_users!user_id(id, email), user_group_posts!inner(id, group_id, created_at, workspace_user_groups!inner(ws_id))'
    )
    .eq('approval_status', 'APPROVED')
    .not('is_completed', 'is', null)
    .gte('user_group_posts.created_at', cutoff);

  if (checksError) throw checksError;

  const checks = (approvedChecksData ?? []) as OrphanedApprovedCheckRow[];

  console.log('[reconcileOrphanedApprovedPosts] Found checks', {
    total: checks.length,
    sample: checks.slice(0, 3).map((check) => ({
      post_id: check.post_id,
      user_id: check.user_id,
      is_completed: check.is_completed,
      email: check.user?.email,
    })),
  });

  if (checks.length === 0) return { enqueued: 0, checked: 0 };

  const postIds = [...new Set(checks.map((check) => check.post_id))];

  const { data: existingQueueData, error: queueError } = await getQueueTable(
    sbAdmin
  )
    .select('post_id, user_id, status')
    .in('post_id', postIds)
    .in('status', ['queued', 'processing', 'sent', 'skipped']);

  if (queueError) throw queueError;

  const covered = new Set(
    (existingQueueData ?? []).map((row) => `${row.post_id}:${row.user_id}`)
  );

  const orphaned = checks.filter(
    (check) => !covered.has(`${check.post_id}:${check.user_id}`)
  );

  console.log('[reconcileOrphanedApprovedPosts] Orphaned after queue check', {
    totalChecks: checks.length,
    existingQueueCount: (existingQueueData ?? []).length,
    orphanedCount: orphaned.length,
    sampleOrphaned: orphaned.slice(0, 3).map((check) => ({
      post_id: check.post_id,
      user_id: check.user_id,
      is_completed: check.is_completed,
      email: check.user?.email,
    })),
  });

  if (orphaned.length === 0) return { enqueued: 0, checked: checks.length };

  const byPost = new Map<
    string,
    {
      group_id: Database['public']['Tables']['user_group_posts']['Row']['group_id'];
      ws_id: WorkspaceUser['ws_id'];
      userIds: Array<GroupPostCheck['user_id']>;
    }
  >();

  for (const check of orphaned) {
    const wsId = getWorkspaceGroupValue(
      check.user_group_posts.workspace_user_groups,
      'ws_id'
    );
    if (!wsId) continue;

    const existing = byPost.get(check.post_id);
    if (existing) {
      existing.userIds.push(check.user_id);
    } else {
      byPost.set(check.post_id, {
        group_id: check.user_group_posts.group_id,
        ws_id: wsId,
        userIds: [check.user_id],
      });
    }
  }

  let totalEnqueued = 0;
  let postsWithZero = 0;

  for (const [postId, info] of byPost) {
    const result = await enqueueApprovedPostEmails(sbAdmin, {
      wsId: info.ws_id,
      postId,
      groupId: info.group_id,
      userIds: info.userIds,
    });
    if (result.queued === 0) postsWithZero++;
    totalEnqueued += result.queued;
  }

  console.log('[reconcileOrphanedApprovedPosts] Enqueue loop complete', {
    totalPosts: byPost.size,
    postsWithZeroEnqueued: postsWithZero,
    totalEnqueued,
    checked: checks.length,
  });

  return { enqueued: totalEnqueued, checked: checks.length };
}

async function getEligibleReenqueuePairs(
  sbAdmin: TypedSupabaseClient,
  rows: QueueIdPostUserRow[],
  wsId?: string
): Promise<Set<string>> {
  const candidatePairIds = new Set(
    rows.map((row) => `${row.post_id}:${row.user_id}`)
  );
  const candidatePostIds = [...new Set(rows.map((row) => row.post_id))];

  const eligibleCheckRows: Parameters<typeof getEligibleReenqueuePairIds>[0] =
    [];
  for (const postChunk of chunkArray(candidatePostIds)) {
    let checksQuery = sbAdmin
      .from('user_group_post_checks')
      .select(
        'post_id, user_id, is_completed, approval_status, user:workspace_users!user_id(id, email, ws_id)'
      )
      .in('post_id', postChunk)
      .eq('approval_status', 'APPROVED')
      .not('is_completed', 'is', null);

    if (wsId) {
      checksQuery = checksQuery.eq('user.ws_id', wsId);
    }

    const { data, error } = await checksQuery;
    if (error) throw error;

    for (const check of (data ?? []) as CheckEligibilityRow[]) {
      const pairId = `${check.post_id}:${check.user_id}`;
      if (candidatePairIds.has(pairId)) {
        eligibleCheckRows.push({
          post_id: check.post_id,
          user_id: check.user_id,
          approval_status: check.approval_status,
          is_completed: check.is_completed,
          email: check.user?.email ?? null,
        });
      }
    }
  }

  const eligiblePairIds = getEligibleReenqueuePairIds(eligibleCheckRows);
  if (eligiblePairIds.size === 0) return new Set();

  const sentRows: Parameters<typeof getSentPairIds>[0] = [];
  const eligibleUserIds = [...new Set(rows.map((row) => row.user_id))];
  for (const postChunk of chunkArray(candidatePostIds)) {
    for (const userChunk of chunkArray(eligibleUserIds)) {
      const { data, error } = await sbAdmin
        .from('sent_emails')
        .select('post_id, receiver_id')
        .in('post_id', postChunk)
        .in('receiver_id', userChunk);

      if (error) throw error;

      for (const sent of data ?? []) {
        if (!sent.post_id || !sent.receiver_id) continue;
        sentRows.push({
          post_id: sent.post_id,
          receiver_id: sent.receiver_id,
        });
      }
    }
  }

  const sentPairIds = getSentPairIds(sentRows);

  return new Set(getQueueIdsToReenqueue(rows, eligiblePairIds, sentPairIds));
}

export async function reEnqueueSkippedPostEmails(
  sbAdmin: TypedSupabaseClient,
  { wsId }: { wsId?: string } = {}
): Promise<{ reEnqueued: number; totalChecked: number }> {
  const cutoff = getPostEmailMaxAgeCutoff();

  let query = getQueueTable(sbAdmin)
    .select('id, post_id, user_id, last_error')
    .eq('status', 'skipped')
    .not('last_error', 'is', null);

  if (wsId) {
    query = query.eq('ws_id', wsId);
  }

  const { data: skippedRowsData, error: selectError } = await query;
  if (selectError) throw selectError;

  const skippedRows = filterAgeSkippedRows(
    (skippedRowsData ?? []) as Array<
      QueueIdPostUserRow & { last_error: string | null }
    >,
    isPostEmailAgeSkipReason
  ) as QueueIdPostUserRow[];

  if (skippedRows.length === 0) {
    return { reEnqueued: 0, totalChecked: 0 };
  }

  const recentPostIds = await getPostIdsAtOrAfterCutoff(
    sbAdmin,
    skippedRows.map((row) => row.post_id),
    cutoff
  );

  const recentRows = filterRowsByRecentPosts(skippedRows, recentPostIds);
  if (recentRows.length === 0) {
    return { reEnqueued: 0, totalChecked: skippedRows.length };
  }

  const eligiblePairSet = await getEligibleReenqueuePairs(
    sbAdmin,
    recentRows,
    wsId
  );
  const queueIdsToReenqueue = recentRows
    .filter((row) => eligiblePairSet.has(row.id))
    .map((row) => row.id);

  if (queueIdsToReenqueue.length === 0) {
    return { reEnqueued: 0, totalChecked: skippedRows.length };
  }

  const reEnqueued = await updateQueueRowsInChunks(
    sbAdmin,
    queueIdsToReenqueue,
    {
      status: 'queued',
      batch_id: null,
      claimed_at: null,
      cancelled_at: null,
      last_attempt_at: null,
      last_error: null,
      attempt_count: 0,
      blocked_reason: null,
      sent_at: null,
      sent_email_id: null,
    },
    ['skipped']
  );

  return {
    reEnqueued,
    totalChecked: skippedRows.length,
  };
}
