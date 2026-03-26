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
  buildEligibleRecipientsDiagnostics,
  buildEnqueueApprovedPostEmailsDiagnostics,
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
  EligibleRecipientsDiagnostics,
  EnqueueApprovedPostEmailsDiagnostics,
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
  ReconcileOrphanedApprovedPostsDiagnostics,
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

function createEmptyEnqueueDiagnostics(): EnqueueApprovedPostEmailsDiagnostics {
  return {
    alreadySent: 0,
    eligibleRecipients: 0,
    existingProcessing: 0,
    existingQueued: 0,
    existingSkipped: 0,
    missingCompletion: 0,
    missingEmail: 0,
    missingSenderPlatformUser: 0,
    missingUserRecord: 0,
    notApproved: 0,
    upserted: 0,
  };
}

function createEmptyReconciliationDiagnostics(
  checked = 0
): ReconcileOrphanedApprovedPostsDiagnostics {
  return {
    alreadySent: 0,
    checked,
    coveredByExistingQueue: 0,
    eligibleRecipients: 0,
    existingProcessing: 0,
    existingQueued: 0,
    existingSkipped: 0,
    missingCompletion: 0,
    missingEmail: 0,
    missingSenderPlatformUser: 0,
    missingUserRecord: 0,
    notApproved: 0,
    orphaned: 0,
    upserted: 0,
  };
}

function mergeEnqueueDiagnostics(
  target: ReconcileOrphanedApprovedPostsDiagnostics,
  source: EnqueueApprovedPostEmailsDiagnostics
) {
  target.alreadySent += source.alreadySent;
  target.eligibleRecipients += source.eligibleRecipients;
  target.existingProcessing += source.existingProcessing;
  target.existingQueued += source.existingQueued;
  target.existingSkipped += source.existingSkipped;
  target.missingCompletion += source.missingCompletion;
  target.missingEmail += source.missingEmail;
  target.missingSenderPlatformUser += source.missingSenderPlatformUser;
  target.missingUserRecord += source.missingUserRecord;
  target.notApproved += source.notApproved;
  target.upserted += source.upserted;
}

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

function buildPostUserPairFilter(
  pairs: Array<Pick<GroupPostCheck, 'post_id' | 'user_id'>>
): string {
  return pairs
    .map((pair) => `and(post_id.eq.${pair.post_id},user_id.eq.${pair.user_id})`)
    .join(',');
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

async function resolveSenderPlatformUserIds(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    approvedByWorkspaceUserIds,
  }: {
    wsId: string;
    approvedByWorkspaceUserIds: string[];
  }
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const dedupedWorkspaceUserIds = [...new Set(approvedByWorkspaceUserIds)];

  for (const workspaceUserIdChunk of chunkArray(dedupedWorkspaceUserIds)) {
    const { data, error } = await sbAdmin
      .from('workspace_user_linked_users')
      .select('virtual_user_id, platform_user_id')
      .eq('ws_id', wsId)
      .in('virtual_user_id', workspaceUserIdChunk);

    if (error) throw error;

    for (const row of (data ?? []) as Array<
      Pick<WorkspaceUserLinkedUserRow, 'virtual_user_id' | 'platform_user_id'>
    >) {
      resolved.set(row.virtual_user_id, row.platform_user_id);
    }
  }

  return resolved;
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
): Promise<{
  diagnostics: EligibleRecipientsDiagnostics;
  recipients: EligibleRecipient[];
}> {
  // Query 1: Get check records with user data (with ws_id filter)
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

  // Query 2: Get all check records for this post (without user filter) to diagnose missing users
  let allChecksQuery = sbAdmin
    .from('user_group_post_checks')
    .select('user_id, is_completed, approval_status, approved_by')
    .eq('post_id', postId);

  if (userIds && userIds.length > 0) {
    allChecksQuery = allChecksQuery.in('user_id', userIds);
  }

  const { data: allChecksData, error: allChecksError } = await allChecksQuery;
  if (allChecksError) throw allChecksError;

  const allCheckRows = allChecksData ?? [];
  const foundUserIds = new Set(rows.map((r) => r.user_id));
  const missingFromUserTable = allCheckRows
    .filter((r) => !foundUserIds.has(r.user_id))
    .map((r) => r.user_id);

  // Enhanced diagnostics
  const diagnostics = {
    totalCheckRows: allCheckRows.length,
    rowsWithUserData: rows.length,
    missingFromUserTable: missingFromUserTable.length,
    missingIsCompleted: [] as string[],
    notApproved: [] as Array<{ userId: string; status: string | null }>,
    missingUserObject: [] as string[],
    missingEmail: [] as Array<{ userId: string; email: unknown }>,
    kept: [] as string[],
  };

  const filtered = rows
    .filter((row) => {
      const hasCompletion = row.is_completed !== null;
      const isApproved = row.approval_status === 'APPROVED';
      const hasUser = row.user != null;
      const hasEmail = row.user?.email != null && row.user?.email !== '';

      if (!hasCompletion) diagnostics.missingIsCompleted.push(row.user_id);
      if (hasCompletion && !isApproved)
        diagnostics.notApproved.push({
          userId: row.user_id,
          status: row.approval_status,
        });
      if (hasCompletion && isApproved && !hasUser)
        diagnostics.missingUserObject.push(row.user_id);
      if (hasCompletion && isApproved && hasUser && !hasEmail)
        diagnostics.missingEmail.push({
          userId: row.user_id,
          email: row.user?.email,
        });

      const keep = hasCompletion && isApproved && hasUser && hasEmail;
      if (keep) diagnostics.kept.push(row.user_id);
      return keep;
    })
    .map((row) => ({
      user_id: row.user_id,
      email: row.user!.email,
      approved_by: row.approved_by,
    }));

  const withValidEmail = filtered.filter((row) =>
    isValidEmailAddress(row.email)
  );
  const invalidEmailCount = filtered.length - withValidEmail.length;
  const diagnosticsSummary = buildEligibleRecipientsDiagnostics({
    eligibleRecipients: withValidEmail.length,
    invalidEmail: invalidEmailCount,
    missingEmail: diagnostics.missingEmail.length,
    missingFromUserTable: diagnostics.missingFromUserTable,
    missingIsCompleted: diagnostics.missingIsCompleted.length,
    missingUserObject: diagnostics.missingUserObject.length,
    notApproved: diagnostics.notApproved.length,
    rowsWithUserData: diagnostics.rowsWithUserData,
    totalCheckRows: diagnostics.totalCheckRows,
  });

  // Log diagnostics - always log when users are skipped due to missing emails
  const hasSkippedUsers = diagnosticsSummary.missingEmail > 0;
  const hasDiagnostics =
    allCheckRows.length !== rows.length ||
    diagnostics.missingIsCompleted.length > 0 ||
    diagnostics.notApproved.length > 0 ||
    diagnostics.missingUserObject.length > 0 ||
    hasSkippedUsers;

  if (hasDiagnostics || allCheckRows.length !== withValidEmail.length) {
    console.log('[getEligibleRecipients] Processing results', {
      postId,
      wsId,
      summary: {
        totalCheckRows: diagnostics.totalCheckRows,
        rowsWithUserData: diagnostics.rowsWithUserData,
        eligibleForEmail: diagnosticsSummary.eligibleRecipients,
        skippedNoEmail: diagnosticsSummary.missingEmail,
      },
      filters: {
        missingIsCompleted: diagnosticsSummary.missingCompletion,
        notApproved: diagnosticsSummary.notApproved,
        missingUserObject: diagnostics.missingUserObject.length,
        missingEmail: diagnosticsSummary.missingEmail,
        kept: diagnostics.kept.length,
      },
      // Sample of users skipped due to missing email
      sampleSkippedNoEmail: diagnostics.missingEmail
        .slice(0, 5)
        .map((m) => m.userId),
      sampleKept: diagnostics.kept.slice(0, 3),
      sampleEligible: withValidEmail.slice(0, 2),
    });
  }

  return {
    diagnostics: diagnosticsSummary,
    recipients: withValidEmail,
  };
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
  const emptyDiagnostics = createEmptyEnqueueDiagnostics();

  const { data: post, error: postError } = await sbAdmin
    .from('user_group_posts')
    .select('id, group_id, created_at, workspace_user_groups!inner(ws_id)')
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .maybeSingle<PostScopeRow>();

  if (postError) throw postError;
  if (!post) return { diagnostics: emptyDiagnostics, queued: 0 };
  if (groupId && post.group_id !== groupId)
    return { diagnostics: emptyDiagnostics, queued: 0 };

  if (post.created_at < getPostEmailMaxAgeCutoff()) {
    return { diagnostics: emptyDiagnostics, queued: 0 };
  }

  const { diagnostics: recipientDiagnostics, recipients } =
    await getEligibleRecipients(sbAdmin, {
      wsId,
      postId,
      userIds,
    });

  if (recipients.length === 0) {
    console.log('[enqueueApprovedPostEmails] No eligible recipients', {
      postId,
      wsId,
      userIds,
      diagnostics: recipientDiagnostics,
    });
    return {
      diagnostics: {
        ...emptyDiagnostics,
        eligibleRecipients: recipientDiagnostics.eligibleRecipients,
        missingCompletion: recipientDiagnostics.missingCompletion,
        missingEmail: recipientDiagnostics.missingEmail,
        missingUserRecord: recipientDiagnostics.missingUserRecord,
        notApproved: recipientDiagnostics.notApproved,
      },
      queued: 0,
    };
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

  if (filteredRecipients.length === 0) {
    return {
      diagnostics: buildEnqueueApprovedPostEmailsDiagnostics({
        existingRows: recipients
          .map((recipient) => {
            const existing = existingByUserId.get(recipient.user_id);
            if (!existing) return null;
            return { status: existing.status, user_id: existing.user_id };
          })
          .filter(
            (
              row
            ): row is {
              status: string;
              user_id: string;
            } => row !== null
          ),
        missingSenderPlatformUser: 0,
        recipientDiagnostics,
        sentRecipientIds,
        upserted: 0,
      }),
      queued: 0,
    };
  }

  const senderPlatformUserByApprover = senderPlatformUserId
    ? new Map<string, string>()
    : await resolveSenderPlatformUserIds(sbAdmin, {
        wsId,
        approvedByWorkspaceUserIds: filteredRecipients
          .map((recipient) => recipient.approved_by)
          .filter((approvedBy): approvedBy is string => Boolean(approvedBy)),
      });

  const upsertRows: PostEmailQueueUpsertRow[] = [];
  let missingSenderPlatformUser = 0;
  for (const recipient of filteredRecipients) {
    const resolvedSenderPlatformUserId =
      senderPlatformUserId ??
      (recipient.approved_by
        ? (senderPlatformUserByApprover.get(recipient.approved_by) ?? null)
        : null);

    if (!resolvedSenderPlatformUserId) {
      missingSenderPlatformUser++;
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
    missingSenderPlatformUser,
  });

  const diagnostics = buildEnqueueApprovedPostEmailsDiagnostics({
    existingRows: recipients
      .map((recipient) => {
        const existing = existingByUserId.get(recipient.user_id);
        if (!existing) return null;
        return { status: existing.status, user_id: existing.user_id };
      })
      .filter(
        (
          row
        ): row is {
          status: string;
          user_id: string;
        } => row !== null
      ),
    missingSenderPlatformUser,
    recipientDiagnostics,
    sentRecipientIds,
    upserted: upsertRows.length,
  });

  if (upsertRows.length === 0) return { diagnostics, queued: 0 };

  const { error: upsertError } = await getQueueTable(sbAdmin).upsert(
    upsertRows,
    {
      onConflict: 'post_id,user_id',
    }
  );

  if (upsertError) throw upsertError;

  return { diagnostics, queued: upsertRows.length };
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

  const oldPostIds = [...new Set(oldChecks.map((check) => check.post_id))];
  const oldUserIds = [...new Set(oldChecks.map((check) => check.user_id))];
  const oldUserIdSet = new Set(oldUserIds);
  const existingQueueRowsData: QueueSenderRow[] = [];
  for (const postChunk of chunkArray(oldPostIds)) {
    const { data, error } = await getQueueTable(sbAdmin)
      .select('post_id, user_id, sender_platform_user_id')
      .in('post_id', postChunk);

    if (error) throw error;
    for (const row of (data ?? []) as QueueSenderRow[]) {
      if (oldUserIdSet.has(row.user_id)) {
        existingQueueRowsData.push(row);
      }
    }
  }

  const existingByPostUser = new Map<string, string>();
  for (const row of existingQueueRowsData) {
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

  const oldCheckPairs = oldChecks.map((check) => ({
    post_id: check.post_id,
    user_id: check.user_id,
  }));
  if (oldCheckPairs.length === 0) return 0;

  let skippedCheckCount = 0;
  for (const pairChunk of chunkArray(oldCheckPairs, 100)) {
    const pairFilter = buildPostUserPairFilter(pairChunk);
    if (!pairFilter) continue;

    const { data, error: updateError } = await sbAdmin
      .from('user_group_post_checks')
      .update({ approval_status: 'SKIPPED' })
      .eq('approval_status', 'APPROVED')
      .or(pairFilter)
      .select('post_id,user_id');

    if (updateError) throw updateError;
    skippedCheckCount += data?.length ?? 0;
  }

  return skippedCheckCount;
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
  let updatedRows = 0;
  const userIdsByPostId = new Map<string, Set<string>>();
  for (const check of rejectedChecks) {
    const existing = userIdsByPostId.get(check.post_id) ?? new Set<string>();
    existing.add(check.user_id);
    userIdsByPostId.set(check.post_id, existing);
  }

  for (const [postId, userIds] of userIdsByPostId) {
    for (const userIdChunk of chunkArray([...userIds])) {
      const { data, error: updateError } = await getQueueTable(sbAdmin)
        .update({
          status: 'skipped',
          batch_id: null,
          claimed_at: null,
          cancelled_at: now,
          last_error: 'Post was rejected - auto-skipped',
        })
        .eq('post_id', postId)
        .in('user_id', userIdChunk)
        .eq('status', 'queued')
        .select('id');

      if (updateError) throw updateError;
      updatedRows += data?.length ?? 0;
    }
  }

  return updatedRows;
}

export async function reconcileOrphanedApprovedPosts(
  sbAdmin: TypedSupabaseClient
): Promise<{
  checked: number;
  diagnostics: ReconcileOrphanedApprovedPostsDiagnostics;
  enqueued: number;
}> {
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

  if (checks.length === 0) {
    return {
      checked: 0,
      diagnostics: createEmptyReconciliationDiagnostics(0),
      enqueued: 0,
    };
  }

  const postIds = [...new Set(checks.map((check) => check.post_id))];
  const existingQueueData: Array<
    Pick<PostEmailQueueRow, 'post_id' | 'user_id' | 'status'>
  > = [];
  for (const postChunk of chunkArray(postIds)) {
    const { data, error: queueError } = await getQueueTable(sbAdmin)
      .select('post_id, user_id, status')
      .in('post_id', postChunk)
      .in('status', ['queued', 'processing', 'sent', 'skipped']);

    if (queueError) throw queueError;
    existingQueueData.push(...(data ?? []));
  }

  const covered = new Set(
    existingQueueData.map((row) => `${row.post_id}:${row.user_id}`)
  );

  const orphaned = checks.filter(
    (check) => !covered.has(`${check.post_id}:${check.user_id}`)
  );
  const diagnostics = createEmptyReconciliationDiagnostics(checks.length);
  diagnostics.coveredByExistingQueue = checks.length - orphaned.length;
  diagnostics.orphaned = orphaned.length;

  console.log('[reconcileOrphanedApprovedPosts] Orphaned after queue check', {
    totalChecks: checks.length,
    existingQueueCount: existingQueueData.length,
    orphanedCount: orphaned.length,
    sampleOrphaned: orphaned.slice(0, 3).map((check) => ({
      post_id: check.post_id,
      user_id: check.user_id,
      is_completed: check.is_completed,
      email: check.user?.email,
    })),
  });

  if (orphaned.length === 0) {
    return {
      checked: checks.length,
      diagnostics,
      enqueued: 0,
    };
  }

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
    mergeEnqueueDiagnostics(diagnostics, result.diagnostics);
  }

  console.log('[reconcileOrphanedApprovedPosts] Enqueue loop complete', {
    totalPosts: byPost.size,
    postsWithZeroEnqueued: postsWithZero,
    totalEnqueued,
    checked: checks.length,
    diagnostics,
  });

  return {
    checked: checks.length,
    diagnostics,
    enqueued: totalEnqueued,
  };
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
  for (const postChunk of chunkArray(candidatePostIds)) {
    const { data, error } = await sbAdmin
      .from('sent_emails')
      .select('post_id, receiver_id')
      .in('post_id', postChunk);

    if (error) throw error;

    for (const sent of data ?? []) {
      if (!sent.post_id || !sent.receiver_id) continue;
      if (candidatePairIds.has(`${sent.post_id}:${sent.receiver_id}`)) {
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
