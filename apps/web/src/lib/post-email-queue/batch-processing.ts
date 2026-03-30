import { render } from '@react-email/render';
import { EmailService } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import {
  buildPostEmailAgeSkipReason,
  getPostEmailMaxAgeCutoff,
} from './constants';
import { getQueueTable } from './queue-core';
import type {
  BatchPrefetch,
  BatchPrefetchContext,
  BatchProcessResult,
  BatchSourceInfo,
  PostEmailQueueRow,
  PostSendContext,
  PrefetchCheckRow,
  PrefetchedPost,
  PrefetchedPostCheck,
  PrefetchedSentEmail,
  PrefetchPostRow,
  PrefetchSentEmailRow,
  QueueClaimedRow,
  QueueClaimUpdate,
  QueuePatch,
  WorkspaceUserGroupRow,
} from './types';
import {
  chunkArray,
  isValidEmailAddress,
  prioritizePostEmailQueueBatch,
  processWithConcurrency,
} from './utils';

const PREFETCH_QUERY_CHUNK_SIZE = 200;

export function buildPostEmailSubject(
  createdAt: string,
  username: string
): string {
  return `Easy Center | Báo cáo tiến độ ngày ${dayjs(createdAt).format('DD/MM/YYYY')} của ${username}`;
}

function getWorkspaceGroupName(
  workspaceGroup:
    | Pick<WorkspaceUserGroupRow, 'ws_id' | 'name'>
    | Array<Pick<WorkspaceUserGroupRow, 'ws_id' | 'name'>>
    | null
): WorkspaceUserGroupRow['name'] | null {
  if (!workspaceGroup) return null;
  return Array.isArray(workspaceGroup)
    ? (workspaceGroup[0]?.name ?? null)
    : workspaceGroup.name;
}

async function markQueueRow(
  sbAdmin: TypedSupabaseClient,
  queueId: PostEmailQueueRow['id'],
  patch: QueuePatch
): Promise<void> {
  const { error } = await getQueueTable(sbAdmin)
    .update(patch)
    .eq('id', queueId);
  if (error) throw error;
}

async function prefetchBatchData(
  sbAdmin: TypedSupabaseClient,
  rows: PostEmailQueueRow[]
): Promise<BatchPrefetchContext> {
  const startTime = Date.now();
  const postIds = [...new Set(rows.map((row) => row.post_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const wsIds = [...new Set(rows.map((row) => row.ws_id))];

  console.log('[PostEmailQueueBatch] Prefetching batch data', {
    rowCount: rows.length,
    uniquePosts: postIds.length,
    uniqueUsers: userIds.length,
    uniqueWorkspaces: wsIds.length,
  });

  const postRows: PrefetchPostRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    const { data, error } = await sbAdmin
      .from('user_group_posts')
      .select(
        'id, group_id, title, content, created_at, workspace_user_groups!inner(ws_id, name)'
      )
      .in('id', postChunk);

    if (error) throw error;
    postRows.push(...((data ?? []) as PrefetchPostRow[]));
  }

  const checkRows: PrefetchCheckRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    for (const userChunk of chunkArray(userIds, PREFETCH_QUERY_CHUNK_SIZE)) {
      const { data, error } = await sbAdmin
        .from('user_group_post_checks')
        .select(
          'post_id, user_id, notes, is_completed, approval_status, user:workspace_users!user_id!inner(id, email, full_name, display_name)'
        )
        .in('post_id', postChunk)
        .in('user_id', userChunk);

      if (error) throw error;
      checkRows.push(...((data ?? []) as PrefetchCheckRow[]));
    }
  }

  const sentEmailRows: PrefetchSentEmailRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    for (const userChunk of chunkArray(userIds, PREFETCH_QUERY_CHUNK_SIZE)) {
      const { data, error } = await sbAdmin
        .from('sent_emails')
        .select('id, post_id, receiver_id, created_at')
        .in('post_id', postChunk)
        .in('receiver_id', userChunk);

      if (error) throw error;
      sentEmailRows.push(...((data ?? []) as PrefetchSentEmailRow[]));
    }
  }

  const posts = new Map<PostEmailQueueRow['post_id'], PrefetchedPost | null>();
  for (const post of postRows) {
    posts.set(post.id, {
      id: post.id,
      group_id: post.group_id,
      title: post.title,
      content: post.content,
      created_at: post.created_at,
      group_name: getWorkspaceGroupName(post.workspace_user_groups),
    });
  }

  const checks = new Map<string, PrefetchedPostCheck>();
  for (const check of checkRows) {
    checks.set(`${check.post_id}:${check.user_id}`, check);
  }

  const existingSentEmails = new Map<string, PrefetchedSentEmail>();
  for (const sentEmail of sentEmailRows) {
    existingSentEmails.set(`${sentEmail.post_id}:${sentEmail.receiver_id}`, {
      id: sentEmail.id,
      created_at: sentEmail.created_at,
    });
  }

  const blockedEmailCache = await preloadBlockedEmailCache(
    sbAdmin,
    checkRows.map((check) => check.user?.email ?? null)
  );
  const blockedRecipientEmails = new Set(
    [...blockedEmailCache.entries()]
      .filter(([, isBlocked]) => isBlocked)
      .map(([email]) => email)
  );

  const emailServices = new Map<string, EmailService>();
  const sourceInfos = new Map<string, BatchSourceInfo>();

  for (const wsId of wsIds) {
    emailServices.set(wsId, await EmailService.fromWorkspaceAdmin(wsId));
    const { data, error } = await sbAdmin
      .from('workspace_email_credentials')
      .select('source_name, source_email')
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) throw error;

    sourceInfos.set(wsId, {
      source_name: data?.source_name ?? 'Tuturuuu',
      source_email: data?.source_email ?? 'notifications@tuturuuu.com',
    });
  }

  console.log('[PostEmailQueueBatch] Prefetch complete', {
    durationMs: Date.now() - startTime,
    postsFound: posts.size,
    checksFound: checks.size,
    sentEmailsFound: existingSentEmails.size,
    workspacesInitialized: emailServices.size,
  });

  const batchPrefetch: BatchPrefetchContext = {
    blockedRecipientEmails,
    posts,
    checks,
    existingSentEmails,
    emailServices,
    sourceInfos,
  };

  return batchPrefetch;
}

function buildPostSendContextFromPrefetch(
  queueRow: PostEmailQueueRow,
  prefetch: BatchPrefetch
): PostSendContext | null {
  const post = prefetch.posts.get(queueRow.post_id);
  if (!post) return null;

  const check = prefetch.checks.get(`${queueRow.post_id}:${queueRow.user_id}`);
  if (
    !check ||
    check.is_completed === null ||
    check.approval_status !== 'APPROVED'
  ) {
    return null;
  }

  if (!isValidEmailAddress(check.user?.email)) {
    return null;
  }

  return {
    post,
    recipient: {
      id: check.user_id,
      email: check.user.email,
      username:
        check.user.full_name ?? check.user.display_name ?? check.user.email,
      notes: check.notes,
      is_completed: check.is_completed,
    },
  };
}

async function processEmailWithContext(
  sbAdmin: TypedSupabaseClient,
  row: PostEmailQueueRow,
  prefetch: BatchPrefetchContext
): Promise<BatchProcessResult> {
  const context = buildPostSendContextFromPrefetch(row, prefetch);

  if (!context) {
    const post = prefetch.posts.get(row.post_id);
    const isOld = Boolean(post && post.created_at < getPostEmailMaxAgeCutoff());

    await markQueueRow(sbAdmin, row.id, {
      status: isOld ? 'skipped' : 'cancelled',
      batch_id: null,
      cancelled_at: new Date().toISOString(),
      last_error: isOld
        ? buildPostEmailAgeSkipReason()
        : 'Post is no longer approved or recipient is no longer eligible.',
    });

    return { id: row.id, status: isOld ? 'skipped' : 'cancelled' };
  }

  const existingSentEmail = prefetch.existingSentEmails.get(
    `${row.post_id}:${row.user_id}`
  );

  if (existingSentEmail) {
    await markQueueRow(sbAdmin, row.id, {
      status: 'sent',
      batch_id: null,
      sent_at: existingSentEmail.created_at,
      sent_email_id: existingSentEmail.id,
      last_error: null,
      blocked_reason: null,
    });

    return { id: row.id, status: 'sent' };
  }

  if (
    prefetch.blockedRecipientEmails.has(context.recipient.email.toLowerCase())
  ) {
    await markQueueRow(sbAdmin, row.id, {
      status: 'skipped',
      batch_id: null,
      blocked_reason: 'blacklist',
      last_error: 'Blocked: blacklist',
    });
    return { id: row.id, status: 'skipped' };
  }

  const emailService = prefetch.emailServices.get(row.ws_id);
  if (!emailService) {
    await markQueueRow(sbAdmin, row.id, {
      status: 'failed',
      batch_id: null,
      blocked_reason: null,
      last_error: `Email service unavailable for workspace ${row.ws_id}`,
    });
    return { id: row.id, status: 'failed' };
  }

  const sourceInfo = prefetch.sourceInfos.get(row.ws_id);
  if (!sourceInfo) {
    await markQueueRow(sbAdmin, row.id, {
      status: 'failed',
      batch_id: null,
      blocked_reason: null,
      last_error: `Email source unavailable for workspace ${row.ws_id}`,
    });
    return { id: row.id, status: 'failed' };
  }

  const subject = buildPostEmailSubject(
    context.post.created_at,
    context.recipient.username
  );

  const htmlContent = await render(
    PostEmailTemplate({
      post: context.post,
      groupName: context.post.group_name ?? undefined,
      username: context.recipient.username,
      isHomeworkDone: context.recipient.is_completed ?? undefined,
      notes: context.recipient.notes ?? undefined,
    })
  );

  const sendResult = await emailService.send({
    recipients: { to: [context.recipient.email] },
    content: { subject, html: htmlContent },
    metadata: {
      wsId: row.ws_id,
      userId: row.sender_platform_user_id,
      templateType: 'user-group-post',
      entityType: 'post',
      entityId: row.post_id,
      priority: 'normal',
    },
  });

  if (!sendResult.success) {
    const blockedRecipient = sendResult.blockedRecipients?.[0];
    const isRateLimited = Boolean(
      sendResult.rateLimitInfo && !sendResult.rateLimitInfo.allowed
    );

    if (blockedRecipient) {
      await markQueueRow(sbAdmin, row.id, {
        status: 'skipped',
        batch_id: null,
        blocked_reason: blockedRecipient.reason ?? null,
        last_error: `Blocked: ${blockedRecipient.reason ?? 'recipient blocked'}`,
      });
      return { id: row.id, status: 'skipped' };
    }

    if (isRateLimited) {
      await markQueueRow(sbAdmin, row.id, {
        status: 'failed',
        batch_id: null,
        blocked_reason: null,
        last_error: sendResult.rateLimitInfo?.reason ?? 'Rate limited',
      });
      return { id: row.id, status: 'failed' };
    }

    await markQueueRow(sbAdmin, row.id, {
      status: 'failed',
      batch_id: null,
      blocked_reason: null,
      last_error: sendResult.error ?? 'Unknown send failure',
    });
    return { id: row.id, status: 'failed' };
  }

  const sentEmailInsert: Database['public']['Tables']['sent_emails']['Insert'] =
    {
      post_id: row.post_id,
      ws_id: row.ws_id,
      sender_id: row.sender_platform_user_id,
      receiver_id: row.user_id,
      email: context.recipient.email,
      subject,
      content: htmlContent,
      source_name: sourceInfo.source_name,
      source_email: sourceInfo.source_email,
    };

  const { data: sentEmail, error: sentInsertError } = await sbAdmin
    .from('sent_emails')
    .insert(sentEmailInsert)
    .select('id')
    .single();

  if (sentInsertError) throw sentInsertError;

  const { error: checkUpdateError } = await sbAdmin
    .from('user_group_post_checks')
    .update({ email_id: sentEmail.id })
    .eq('post_id', row.post_id)
    .eq('user_id', row.user_id);

  if (checkUpdateError) {
    console.warn('[PostEmailQueueBatch] Failed to link email_id to check', {
      rowId: row.id,
      postId: row.post_id,
      userId: row.user_id,
      emailId: sentEmail.id,
      error: checkUpdateError,
    });
  }

  await markQueueRow(sbAdmin, row.id, {
    status: 'sent',
    batch_id: null,
    sent_at: new Date().toISOString(),
    sent_email_id: sentEmail.id,
    last_error: null,
    blocked_reason: null,
  });

  return { id: row.id, status: 'sent' };
}

export async function sendPostEmailImmediately(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    groupId,
    postId,
    userId,
    senderPlatformUserId,
  }: {
    wsId: string;
    groupId: string;
    postId: string;
    userId: string;
    senderPlatformUserId: string;
  }
): Promise<BatchProcessResult> {
  const now = new Date().toISOString();

  const { data: existingRow, error: existingRowError } = await getQueueTable(
    sbAdmin
  )
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRowError) throw existingRowError;

  const nextAttemptCount =
    (existingRow?.attempt_count && existingRow.attempt_count > 0
      ? existingRow.attempt_count
      : 0) + 1;

  const { data: upsertedRows, error: upsertError } = await getQueueTable(
    sbAdmin
  )
    .upsert(
      [
        {
          ws_id: wsId,
          group_id: groupId,
          post_id: postId,
          user_id: userId,
          sender_platform_user_id: senderPlatformUserId,
          status: 'processing',
          batch_id: null,
          attempt_count: nextAttemptCount,
          last_error: null,
          blocked_reason: null,
          claimed_at: now,
          last_attempt_at: now,
          sent_at: null,
          cancelled_at: null,
          sent_email_id: null,
        },
      ],
      {
        onConflict: 'post_id,user_id',
      }
    )
    .select('*');

  if (upsertError) throw upsertError;

  const queueRow = upsertedRows?.[0];
  if (!queueRow) {
    throw new Error('Failed to create immediate-send queue row');
  }

  const prefetch = await prefetchBatchData(sbAdmin, [queueRow]);
  return processEmailWithContext(sbAdmin, queueRow, prefetch);
}

async function normalizeQueueError(
  sbAdmin: TypedSupabaseClient,
  row: PostEmailQueueRow,
  error: Error
): Promise<BatchProcessResult> {
  console.error('[PostEmailQueueBatch] Row processing failed', {
    rowId: row.id,
    postId: row.post_id,
    userId: row.user_id,
    error,
  });

  try {
    await markQueueRow(sbAdmin, row.id, {
      status: 'failed',
      batch_id: null,
      blocked_reason: null,
      last_error: error.message || 'Unknown processing error',
    });
  } catch (markError) {
    console.error('[PostEmailQueueBatch] Failed to persist row failure', {
      rowId: row.id,
      postId: row.post_id,
      userId: row.user_id,
      error: markError,
    });
  }

  return {
    id: row.id,
    status: 'failed',
  };
}

export async function processPostEmailQueueBatch(
  sbAdmin: TypedSupabaseClient,
  {
    limit = 200,
    sendLimit = 50,
    concurrency = 10,
    maxDurationMs = 150_000,
  }: {
    limit?: number;
    sendLimit?: number;
    concurrency?: number;
    maxDurationMs?: number;
  } = {}
) {
  const safeLimit = Math.max(1, limit);
  const safeSendLimit = Math.max(1, sendLimit);
  const safeConcurrency = Math.max(1, Math.min(concurrency, 20));
  const startTime = Date.now();

  const { data: queuedData, error: queuedError } = await getQueueTable(sbAdmin)
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(safeLimit);

  if (queuedError) throw queuedError;

  console.log('[PostEmailQueueBatch] Fetched queued rows', {
    queuedCount: (queuedData ?? []).length,
    safeLimit,
    elapsedMs: Date.now() - startTime,
  });

  let rows = prioritizePostEmailQueueBatch(queuedData ?? [], [], safeLimit);

  if (rows.length < safeLimit) {
    const remaining = safeLimit - rows.length;
    const { data: failedData, error: failedError } = await getQueueTable(
      sbAdmin
    )
      .select('*')
      .eq('status', 'failed')
      .order('last_attempt_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(remaining);

    if (failedError) throw failedError;

    console.log('[PostEmailQueueBatch] Fetched failed rows for fill', {
      failedCount: (failedData ?? []).length,
      remaining,
      elapsedMs: Date.now() - startTime,
    });

    rows = prioritizePostEmailQueueBatch(
      queuedData ?? [],
      failedData ?? [],
      safeLimit
    );
  }

  console.log('[PostEmailQueueBatch] Total rows to process', {
    totalRows: rows.length,
    elapsedMs: Date.now() - startTime,
  });

  if (rows.length === 0) {
    return {
      claimed: 0,
      processed: 0,
      failed: 0,
      timedOut: false,
      results: [] as BatchProcessResult[],
    };
  }

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const claimedRows: QueueClaimedRow[] = [];
  let rowIndex = 0;

  while (claimedRows.length < safeSendLimit && rowIndex < rows.length) {
    if (Date.now() - startTime > maxDurationMs) break;

    const slotsRemaining = safeSendLimit - claimedRows.length;
    const claimWindow = rows.slice(rowIndex, rowIndex + slotsRemaining);
    rowIndex += claimWindow.length;
    if (claimWindow.length === 0) break;

    const rowsByClaimGroup = new Map<
      string,
      {
        rowIds: string[];
        rowStatus: PostEmailQueueRow['status'];
        nextAttempt: number;
      }
    >();
    for (const row of claimWindow) {
      const nextAttempt = row.attempt_count + 1;
      const groupKey = `${row.status}:${nextAttempt}`;
      const existing = rowsByClaimGroup.get(groupKey);
      if (existing) {
        existing.rowIds.push(row.id);
        continue;
      }

      rowsByClaimGroup.set(groupKey, {
        rowIds: [row.id],
        rowStatus: row.status,
        nextAttempt,
      });
    }

    const claimedIdSet = new Set<string>();
    for (const group of rowsByClaimGroup.values()) {
      const claimPatch: QueueClaimUpdate = {
        status: 'processing',
        batch_id: batchId,
        claimed_at: now,
        last_attempt_at: now,
        attempt_count: group.nextAttempt,
        cancelled_at: null,
      };

      const { data: claimData, error: claimError } = await getQueueTable(
        sbAdmin
      )
        .update(claimPatch)
        .in('id', group.rowIds)
        .eq('status', group.rowStatus)
        .select('id');

      if (claimError) continue;
      for (const claimed of claimData ?? []) {
        if (claimed.id) {
          claimedIdSet.add(claimed.id);
        }
      }
    }

    for (const row of claimWindow) {
      if (!claimedIdSet.has(row.id)) continue;
      claimedRows.push({
        ...row,
        status: 'processing',
        batch_id: batchId,
        claimed_at: now,
        last_attempt_at: now,
        attempt_count: row.attempt_count + 1,
      });
      if (claimedRows.length >= safeSendLimit) break;
    }
  }

  if (claimedRows.length === 0) {
    return {
      claimed: 0,
      processed: 0,
      failed: 0,
      timedOut: false,
      results: [] as BatchProcessResult[],
    };
  }

  const prefetch = await prefetchBatchData(sbAdmin, claimedRows);

  const { results, timedOut } = await processWithConcurrency(
    claimedRows,
    (row) => processEmailWithContext(sbAdmin, row, prefetch),
    (row, error) => normalizeQueueError(sbAdmin, row, error),
    safeConcurrency,
    maxDurationMs,
    startTime
  );

  const failed = results.filter((result) => result.status === 'failed').length;

  return {
    claimed: claimedRows.length,
    processed: results.length,
    failed,
    timedOut,
    results,
  };
}
