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
  PrefetchedSentEmailAudit,
  PrefetchPostRow,
  PrefetchSentEmailAuditRow,
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

function createPostUserKey(postId: string, userId: string): string {
  return `${postId}:${userId}`;
}

function createPostRecipientKey(postId: string, email: string): string {
  return `${postId}:${email.trim().toLowerCase()}`;
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

async function getExistingSentEmailRecord(
  sbAdmin: TypedSupabaseClient,
  {
    postId,
    userId,
  }: {
    postId: PostEmailQueueRow['post_id'];
    userId: PostEmailQueueRow['user_id'];
  }
): Promise<PrefetchedSentEmail | null> {
  const { data, error } = await sbAdmin
    .from('sent_emails')
    .select('id, created_at')
    .eq('post_id', postId)
    .eq('receiver_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  const existingRecord = data?.[0];
  if (!existingRecord) return null;

  return {
    id: existingRecord.id,
    created_at: existingRecord.created_at,
  };
}

async function persistSentEmailRecord(
  sbAdmin: TypedSupabaseClient,
  {
    htmlContent,
    postId,
    recipientEmail,
    senderPlatformUserId,
    sourceInfo,
    subject,
    userId,
    wsId,
  }: {
    htmlContent: string;
    postId: PostEmailQueueRow['post_id'];
    recipientEmail: string;
    senderPlatformUserId: string;
    sourceInfo: BatchSourceInfo;
    subject: string;
    userId: PostEmailQueueRow['user_id'];
    wsId: PostEmailQueueRow['ws_id'];
  }
): Promise<PrefetchedSentEmail> {
  const existingRecord = await getExistingSentEmailRecord(sbAdmin, {
    postId,
    userId,
  });
  if (existingRecord) return existingRecord;

  const sentEmailInsert: Database['public']['Tables']['sent_emails']['Insert'] =
    {
      post_id: postId,
      ws_id: wsId,
      sender_id: senderPlatformUserId,
      receiver_id: userId,
      email: recipientEmail,
      subject,
      content: htmlContent,
      source_name: sourceInfo.source_name,
      source_email: sourceInfo.source_email,
    };

  const { data: sentEmail, error: sentInsertError } = await sbAdmin
    .from('sent_emails')
    .insert(sentEmailInsert)
    .select('id, created_at')
    .single();

  if (sentInsertError) throw sentInsertError;

  return {
    id: sentEmail.id,
    created_at: sentEmail.created_at,
  };
}

async function linkSentEmailToCheck(
  sbAdmin: TypedSupabaseClient,
  {
    postId,
    sentEmailId,
    userId,
  }: {
    postId: PostEmailQueueRow['post_id'];
    sentEmailId: string;
    userId: PostEmailQueueRow['user_id'];
  }
): Promise<void> {
  const { error: checkUpdateError } = await sbAdmin
    .from('user_group_post_checks')
    .update({ email_id: sentEmailId })
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (checkUpdateError) {
    console.warn('[PostEmailQueueBatch] Failed to link email_id to check', {
      postId,
      userId,
      emailId: sentEmailId,
      error: checkUpdateError,
    });
  }
}

function buildSentEmailPersistenceWarning(
  error: unknown,
  details?: {
    auditId?: string;
    messageId?: string;
  }
): string {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown sent email persistence error';
  const suffix = [details?.auditId, details?.messageId]
    .filter(Boolean)
    .join(', ');

  if (!suffix) {
    return `Delivery accepted by provider, but local sent email persistence failed: ${message}`;
  }

  return `Delivery accepted by provider, but local sent email persistence failed (${suffix}): ${message}`;
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

  const sentEmailAuditRows: PrefetchSentEmailAuditRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    const { data, error } = await sbAdmin
      .from('email_audit')
      .select(
        'id, entity_id, to_addresses, sent_at, created_at, source_name, source_email, subject, html_content, user_id'
      )
      .eq('entity_type', 'post')
      .eq('status', 'sent')
      .in('entity_id', postChunk);

    if (error) throw error;
    sentEmailAuditRows.push(...((data ?? []) as PrefetchSentEmailAuditRow[]));
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
    if (!sentEmail.post_id) continue;

    existingSentEmails.set(
      createPostUserKey(sentEmail.post_id, sentEmail.receiver_id),
      {
        id: sentEmail.id,
        created_at: sentEmail.created_at,
      }
    );
  }

  const existingSentEmailAudits = new Map<string, PrefetchedSentEmailAudit>();
  for (const sentEmailAudit of sentEmailAuditRows) {
    if (!sentEmailAudit.entity_id) continue;

    for (const recipientEmail of sentEmailAudit.to_addresses ?? []) {
      const mapKey = createPostRecipientKey(
        sentEmailAudit.entity_id,
        recipientEmail
      );
      const existingAudit = existingSentEmailAudits.get(mapKey);
      const existingTimestamp =
        existingAudit?.sent_at ?? existingAudit?.created_at ?? '';
      const nextTimestamp =
        sentEmailAudit.sent_at ?? sentEmailAudit.created_at ?? '';

      if (existingAudit && existingTimestamp >= nextTimestamp) {
        continue;
      }

      existingSentEmailAudits.set(mapKey, {
        created_at: sentEmailAudit.created_at,
        html_content: sentEmailAudit.html_content,
        id: sentEmailAudit.id,
        sender_platform_user_id: sentEmailAudit.user_id,
        sent_at: sentEmailAudit.sent_at,
        source_email: sentEmailAudit.source_email,
        source_name: sentEmailAudit.source_name,
        subject: sentEmailAudit.subject,
      });
    }
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
    sentEmailAuditsFound: existingSentEmailAudits.size,
    workspacesInitialized: emailServices.size,
  });

  const batchPrefetch: BatchPrefetchContext = {
    blockedRecipientEmails,
    existingSentEmailAudits,
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
    createPostUserKey(row.post_id, row.user_id)
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

  const existingSentAudit = prefetch.existingSentEmailAudits.get(
    createPostRecipientKey(row.post_id, context.recipient.email)
  );

  if (existingSentAudit) {
    let recoveredSentEmail: PrefetchedSentEmail | null = null;
    let recoveryWarning: string | null = null;

    if (existingSentAudit.html_content) {
      try {
        recoveredSentEmail = await persistSentEmailRecord(sbAdmin, {
          htmlContent: existingSentAudit.html_content,
          postId: row.post_id,
          recipientEmail: context.recipient.email,
          senderPlatformUserId:
            existingSentAudit.sender_platform_user_id ??
            row.sender_platform_user_id,
          sourceInfo: {
            source_email: existingSentAudit.source_email,
            source_name: existingSentAudit.source_name,
          },
          subject: existingSentAudit.subject,
          userId: row.user_id,
          wsId: row.ws_id,
        });

        await linkSentEmailToCheck(sbAdmin, {
          postId: row.post_id,
          sentEmailId: recoveredSentEmail.id,
          userId: row.user_id,
        });
      } catch (error) {
        recoveryWarning = buildSentEmailPersistenceWarning(error, {
          auditId: existingSentAudit.id,
        });
      }
    } else {
      recoveryWarning =
        'Delivery was recovered from email audit, but the sent email history row could not be rebuilt automatically.';
    }

    await markQueueRow(sbAdmin, row.id, {
      status: 'sent',
      batch_id: null,
      sent_at: existingSentAudit.sent_at ?? existingSentAudit.created_at,
      sent_email_id: recoveredSentEmail?.id ?? null,
      last_error: recoveryWarning,
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

  const deliveredAt = new Date().toISOString();
  let sentEmail: PrefetchedSentEmail | null = null;
  let persistenceWarning: string | null = null;

  try {
    sentEmail = await persistSentEmailRecord(sbAdmin, {
      htmlContent,
      postId: row.post_id,
      recipientEmail: context.recipient.email,
      senderPlatformUserId: row.sender_platform_user_id,
      sourceInfo,
      subject,
      userId: row.user_id,
      wsId: row.ws_id,
    });

    await linkSentEmailToCheck(sbAdmin, {
      postId: row.post_id,
      sentEmailId: sentEmail.id,
      userId: row.user_id,
    });
  } catch (error) {
    persistenceWarning = buildSentEmailPersistenceWarning(error, {
      auditId: sendResult.auditId,
      messageId: sendResult.messageId,
    });
  }

  await markQueueRow(sbAdmin, row.id, {
    status: 'sent',
    batch_id: null,
    sent_at: deliveredAt,
    sent_email_id: sentEmail?.id ?? null,
    last_error: persistenceWarning,
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
  const results: BatchProcessResult[] = [];
  let claimedCount = 0;
  let failed = 0;
  let timedOut = false;
  let rowIndex = 0;

  while (claimedCount < safeSendLimit && rowIndex < rows.length) {
    if (Date.now() - startTime > maxDurationMs) {
      timedOut = true;
      break;
    }

    const now = new Date().toISOString();
    const slotsRemaining = Math.min(
      safeConcurrency,
      safeSendLimit - claimedCount
    );
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

    const claimedRows: QueueClaimedRow[] = [];
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
      if (claimedRows.length >= slotsRemaining) break;
    }

    if (claimedRows.length === 0) {
      continue;
    }

    claimedCount += claimedRows.length;

    const prefetch = await prefetchBatchData(sbAdmin, claimedRows);

    const batchResult = await processWithConcurrency(
      claimedRows,
      (row) => processEmailWithContext(sbAdmin, row, prefetch),
      (row, error) => normalizeQueueError(sbAdmin, row, error),
      safeConcurrency,
      maxDurationMs,
      startTime
    );

    results.push(...batchResult.results);
    failed += batchResult.results.filter(
      (result) => result.status === 'failed'
    ).length;

    if (batchResult.timedOut) {
      timedOut = true;
      break;
    }
  }

  return {
    claimed: claimedCount,
    processed: results.length,
    failed,
    timedOut,
    results,
  };
}
