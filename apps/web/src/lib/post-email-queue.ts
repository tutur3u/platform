import { render } from '@react-email/render';
import { EmailService } from '@tuturuuu/email-service';
import type { UserGroupPost } from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template';

export const POST_EMAIL_QUEUE_TABLE = 'post_email_queue';

export type PostEmailQueueStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'skipped';

export const POST_EMAIL_MAX_AGE_DAYS = 60;

export function getPostEmailMaxAgeCutoff(): string {
  return dayjs().subtract(POST_EMAIL_MAX_AGE_DAYS, 'day').toISOString();
}

export interface PostEmailQueueRow {
  id: string;
  ws_id: string;
  group_id: string;
  post_id: string;
  user_id: string;
  sender_platform_user_id: string;
  status: PostEmailQueueStatus;
  batch_id: string | null;
  attempt_count: number;
  last_error: string | null;
  blocked_reason: string | null;
  claimed_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  sent_email_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ExistingQueueState {
  id: string;
  user_id: string;
  status: PostEmailQueueStatus;
}

interface EligibleRecipient {
  user_id: string;
  email: string;
  approved_by: string | null;
}

interface PostSendContext {
  post: UserGroupPost & { group_name?: string | null };
  recipient: {
    id: string;
    email: string;
    username: string;
    notes: string | null;
    is_completed: boolean | null;
  };
}

function getQueueTable(sbAdmin: any) {
  return sbAdmin.from(POST_EMAIL_QUEUE_TABLE);
}

function isValidEmailAddress(
  email: string | null | undefined
): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function summarizePostEmailQueue(
  rows: Array<Pick<PostEmailQueueRow, 'status'>>
) {
  return {
    queued: rows.filter((row) => row.status === 'queued').length,
    processing: rows.filter((row) => row.status === 'processing').length,
    sent: rows.filter((row) => row.status === 'sent').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
  };
}

export async function getPostEmailQueueRows(
  sbAdmin: any,
  postIds: string[]
): Promise<PostEmailQueueRow[]> {
  if (postIds.length === 0) return [];

  const { data, error } = await getQueueTable(sbAdmin)
    .select('*')
    .in('post_id', postIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as PostEmailQueueRow[];
}

export async function hasPostEmailBeenSent(
  sbAdmin: any,
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

  if (sentEmailsError) {
    throw sentEmailsError;
  }

  if (sentQueueRows.error) {
    throw sentQueueRows.error;
  }

  return (sentEmailsCount ?? 0) > 0 || (sentQueueRows.data?.length ?? 0) > 0;
}

async function resolveSenderPlatformUserId(
  sbAdmin: any,
  {
    wsId,
    approvedByWorkspaceUserId,
    fallbackSenderPlatformUserId,
  }: {
    wsId: string;
    approvedByWorkspaceUserId?: string | null;
    fallbackSenderPlatformUserId?: string | null;
  }
) {
  if (fallbackSenderPlatformUserId) return fallbackSenderPlatformUserId;
  if (!approvedByWorkspaceUserId) return null;

  const { data, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('ws_id', wsId)
    .eq('virtual_user_id', approvedByWorkspaceUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.platform_user_id ?? null;
}

async function getEligibleRecipients(
  sbAdmin: any,
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
      'user_id, is_completed, approval_status, approved_by, user:workspace_users!user_id!inner(id, email, ws_id)'
    )
    .eq('post_id', postId)
    .eq('user.ws_id', wsId);

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter(
      (row: any) =>
        row.is_completed !== null && row.approval_status === 'APPROVED'
    )
    .map((row: any) => ({
      user_id: row.user_id as string,
      email: row.user?.email as string,
      approved_by: (row.approved_by as string | null) ?? null,
    }))
    .filter((row: EligibleRecipient) => isValidEmailAddress(row.email));
}

export async function enqueueApprovedPostEmails(
  sbAdmin: any,
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
    .maybeSingle();

  if (postError) throw postError;
  if (!post) return { queued: 0 };
  if (groupId && post.group_id !== groupId) return { queued: 0 };

  if (post.created_at) {
    const cutoff = getPostEmailMaxAgeCutoff();
    if (post.created_at < cutoff) {
      return { queued: 0 };
    }
  }

  const recipients = await getEligibleRecipients(sbAdmin, {
    wsId,
    postId,
    userIds,
  });

  if (recipients.length === 0) {
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
    (sentEmailResult.data ?? []).map((row: any) => row.receiver_id as string)
  );
  const existingByUserId = new Map<string, ExistingQueueState>(
    (existingQueueResult.data ?? []).map((row: any) => [
      row.user_id as string,
      row as ExistingQueueState,
    ])
  );

  const candidateRows = recipients
    .filter((recipient) => {
      if (sentRecipientIds.has(recipient.user_id)) return false;
      const existing = existingByUserId.get(recipient.user_id);
      return (
        existing?.status !== 'sent' &&
        existing?.status !== 'processing' &&
        existing?.status !== 'skipped'
      );
    })
    .map(async (recipient) => {
      const resolvedSenderPlatformUserId = await resolveSenderPlatformUserId(
        sbAdmin,
        {
          wsId,
          approvedByWorkspaceUserId: recipient.approved_by,
          fallbackSenderPlatformUserId: senderPlatformUserId,
        }
      );

      if (!resolvedSenderPlatformUserId) {
        return null;
      }

      return {
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
      };
    });

  const upsertRows = (await Promise.all(candidateRows)).filter(Boolean);

  if (upsertRows.length === 0) {
    return { queued: 0 };
  }

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
  sbAdmin: any,
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
  sbAdmin: any,
  { wsId }: { wsId?: string } = {}
): Promise<number> {
  const cutoff = getPostEmailMaxAgeCutoff();

  let query = getQueueTable(sbAdmin)
    .update({
      status: 'skipped',
      batch_id: null,
      claimed_at: null,
      cancelled_at: new Date().toISOString(),
      last_error: `Post older than ${POST_EMAIL_MAX_AGE_DAYS} days`,
    })
    .in('status', ['queued', 'failed', 'blocked'])
    .lt('created_at', cutoff);

  if (wsId) {
    query = query.eq('ws_id', wsId);
  }

  const { data, error } = await query.select('id');

  if (error) throw error;

  return data?.length ?? 0;
}

export async function reconcileOrphanedApprovedPosts(
  sbAdmin: any
): Promise<{ enqueued: number; checked: number }> {
  const cutoff = getPostEmailMaxAgeCutoff();

  const { data: approvedChecks, error: checksError } = await sbAdmin
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, approved_by, user_group_posts!inner(id, group_id, created_at, workspace_user_groups!inner(ws_id))'
    )
    .eq('approval_status', 'APPROVED')
    .not('is_completed', 'is', null)
    .gte('user_group_posts.created_at', cutoff);

  if (checksError) throw checksError;

  const checks = (approvedChecks ?? []) as any[];
  if (checks.length === 0) return { enqueued: 0, checked: 0 };

  const postIds = [...new Set(checks.map((c: any) => c.post_id))];

  const { data: existingQueue, error: queueError } = await getQueueTable(
    sbAdmin
  )
    .select('post_id, user_id, status')
    .in('post_id', postIds)
    .in('status', ['queued', 'processing', 'sent', 'skipped']);

  if (queueError) throw queueError;

  const covered = new Set(
    (existingQueue ?? []).map((r: any) => `${r.post_id}:${r.user_id}` as string)
  );

  const orphaned = checks.filter(
    (c: any) => !covered.has(`${c.post_id}:${c.user_id}`)
  );

  if (orphaned.length === 0) return { enqueued: 0, checked: checks.length };

  const byPost = new Map<
    string,
    {
      group_id: string;
      ws_id: string;
      userIds: string[];
      approved_by: string | null;
    }
  >();

  for (const check of orphaned) {
    const pg = check.user_group_posts;
    const wsId = Array.isArray(pg.workspace_user_groups)
      ? pg.workspace_user_groups[0]?.ws_id
      : pg.workspace_user_groups?.ws_id;

    const existing = byPost.get(check.post_id);
    if (existing) {
      existing.userIds.push(check.user_id);
    } else {
      byPost.set(check.post_id, {
        group_id: pg.group_id,
        ws_id: wsId,
        userIds: [check.user_id],
        approved_by: check.approved_by ?? null,
      });
    }
  }

  let totalEnqueued = 0;

  for (const [postId, info] of byPost) {
    const result = await enqueueApprovedPostEmails(sbAdmin, {
      wsId: info.ws_id,
      postId,
      groupId: info.group_id,
      userIds: info.userIds,
    });
    totalEnqueued += result.queued;
  }

  return { enqueued: totalEnqueued, checked: checks.length };
}

export async function reEnqueueSkippedPostEmails(
  sbAdmin: any,
  { wsId }: { wsId?: string } = {}
): Promise<{ reEnqueued: number; totalChecked: number }> {
  const cutoff = getPostEmailMaxAgeCutoff();

  let skippedQuery = getQueueTable(sbAdmin)
    .select('id, post_id, user_id, ws_id, group_id, attempt_count')
    .eq('status', 'skipped');

  if (wsId) {
    skippedQuery = skippedQuery.eq('ws_id', wsId);
  }

  const { data: skippedRows, error: skippedError } = await skippedQuery;

  if (skippedError) throw skippedError;

  const skipped = (skippedRows ?? []) as Array<{
    id: string;
    post_id: string;
    user_id: string;
    ws_id: string;
    group_id: string;
    attempt_count: number;
  }>;

  if (skipped.length === 0) {
    return { reEnqueued: 0, totalChecked: 0 };
  }

  const postIds = [...new Set(skipped.map((r) => r.post_id))];

  const { data: postData, error: postError } = await sbAdmin
    .from('user_group_posts')
    .select('id, created_at')
    .in('id', postIds)
    .gte('created_at', cutoff);

  if (postError) throw postError;

  const validPostIds = new Set(
    (postData ?? []).map((p: any) => p.id as string)
  );

  const toRequeue = skipped.filter((r) => validPostIds.has(r.post_id));

  if (toRequeue.length === 0) {
    return { reEnqueued: 0, totalChecked: skipped.length };
  }

  const checksQuery = await sbAdmin
    .from('user_group_post_checks')
    .select('post_id, user_id, is_completed')
    .in('post_id', [...new Set(toRequeue.map((r) => r.post_id))])
    .not('is_completed', 'is', null);

  if (checksQuery.error) throw checksQuery.error;

  const eligibleChecks = new Set(
    (checksQuery.data ?? []).map(
      (c: any) => `${c.post_id}:${c.user_id}` as string
    )
  );

  const eligibleToRequeue = toRequeue.filter((r) =>
    eligibleChecks.has(`${r.post_id}:${r.user_id}`)
  );

  const { error: resetError } = await getQueueTable(sbAdmin)
    .update({
      status: 'queued',
      batch_id: null,
      claimed_at: null,
      last_error: null,
    })
    .in(
      'id',
      eligibleToRequeue.map((r) => r.id)
    );

  if (resetError) throw resetError;

  return {
    reEnqueued: eligibleToRequeue.length,
    totalChecked: skipped.length,
  };
}

async function markQueueRow(
  sbAdmin: any,
  queueId: string,
  patch: Record<string, unknown>
) {
  const { error } = await getQueueTable(sbAdmin)
    .update(patch)
    .eq('id', queueId);
  if (error) throw error;
}

interface BatchPrefetch {
  posts: Map<string, (UserGroupPost & { group_name?: string | null }) | null>;
  checks: Map<string, any>;
  existingSentEmails: Map<string, { id: string; created_at: string }>;
  emailServices: Map<string, EmailService>;
  sourceInfos: Map<string, { sourceName: string; sourceEmail: string }>;
}

async function prefetchBatchData(
  sbAdmin: any,
  rows: PostEmailQueueRow[]
): Promise<BatchPrefetch> {
  const postIds = [...new Set(rows.map((r) => r.post_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const wsIds = [...new Set(rows.map((r) => r.ws_id))];

  const [postsResult, checksResult, sentEmailsResult] = await Promise.all([
    sbAdmin
      .from('user_group_posts')
      .select(
        'id, group_id, title, content, notes, created_at, workspace_user_groups!inner(ws_id, name)'
      )
      .in('id', postIds),
    sbAdmin
      .from('user_group_post_checks')
      .select(
        'post_id, user_id, notes, is_completed, approval_status, user:workspace_users!user_id!inner(id, email, full_name, display_name)'
      )
      .in('post_id', postIds)
      .in('user_id', userIds),
    sbAdmin
      .from('sent_emails')
      .select('id, post_id, receiver_id, created_at')
      .in('post_id', postIds)
      .in('receiver_id', userIds),
  ]);

  const posts = new Map<
    string,
    (UserGroupPost & { group_name?: string | null }) | null
  >();
  for (const p of postsResult.data ?? []) {
    posts.set(p.id, {
      ...p,
      post_approval_status: 'APPROVED',
      group_name: Array.isArray(p.workspace_user_groups)
        ? p.workspace_user_groups[0]?.name
        : p.workspace_user_groups?.name,
    } as UserGroupPost & { group_name?: string | null });
  }

  const checks = new Map<string, any>();
  for (const c of checksResult.data ?? []) {
    checks.set(`${c.post_id}:${c.user_id}`, c);
  }

  const existingSentEmails = new Map<
    string,
    { id: string; created_at: string }
  >();
  for (const e of sentEmailsResult.data ?? []) {
    existingSentEmails.set(`${e.post_id}:${e.receiver_id}`, {
      id: e.id,
      created_at: e.created_at,
    });
  }

  const emailServices = new Map<string, EmailService>();
  const sourceInfos = new Map<
    string,
    { sourceName: string; sourceEmail: string }
  >();

  for (const wsId of wsIds) {
    emailServices.set(wsId, await EmailService.fromWorkspace(wsId));
    const { data } = await sbAdmin
      .from('workspace_email_credentials')
      .select('source_name, source_email')
      .eq('ws_id', wsId)
      .maybeSingle();
    sourceInfos.set(wsId, {
      sourceName: data?.source_name || 'Tuturuuu',
      sourceEmail: data?.source_email || 'notifications@tuturuuu.com',
    });
  }

  return { posts, checks, existingSentEmails, emailServices, sourceInfos };
}

async function processEmailWithContext(
  sbAdmin: any,
  row: PostEmailQueueRow,
  prefetch: BatchPrefetch
): Promise<Record<string, unknown>> {
  const context = await buildPostSendContextFromPrefetch(row, prefetch);

  if (!context) {
    const post = prefetch.posts.get(row.post_id);
    const isOld =
      post &&
      typeof post.created_at === 'string' &&
      post.created_at < getPostEmailMaxAgeCutoff();

    await markQueueRow(sbAdmin, row.id, {
      status: isOld ? 'skipped' : 'cancelled',
      batch_id: null,
      cancelled_at: new Date().toISOString(),
      last_error: isOld
        ? `Post older than ${POST_EMAIL_MAX_AGE_DAYS} days`
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
    });
    return { id: row.id, status: 'sent', deduped: true };
  }

  const emailService = prefetch.emailServices.get(row.ws_id)!;
  const sourceInfo = prefetch.sourceInfos.get(row.ws_id)!;

  const subject = `Easy Center | Báo cáo tiến độ ngày ${dayjs(
    context.post.created_at
  ).format('DD/MM/YYYY')} của ${context.recipient.username}`;

  const htmlContent = await render(
    PostEmailTemplate({
      post: context.post,
      groupName: context.post.group_name ?? undefined,
      username: context.recipient.username,
      isHomeworkDone: context.recipient.is_completed ?? undefined,
      notes: context.recipient.notes ?? undefined,
    })
  );

  const result = await emailService.send({
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

  if (!result.success) {
    const blockedRecipient = result.blockedRecipients?.[0];
    await markQueueRow(sbAdmin, row.id, {
      status: blockedRecipient ? 'blocked' : 'failed',
      batch_id: null,
      blocked_reason: blockedRecipient?.reason ?? null,
      last_error:
        blockedRecipient?.reason ??
        result.error ??
        (result.rateLimitInfo && !result.rateLimitInfo.allowed
          ? 'Rate limited'
          : 'Unknown send failure'),
    });
    return { id: row.id, status: blockedRecipient ? 'blocked' : 'failed' };
  }

  const { data: sentEmail, error: sentInsertError } = await sbAdmin
    .from('sent_emails')
    .insert({
      post_id: row.post_id,
      ws_id: row.ws_id,
      sender_id: row.sender_platform_user_id,
      receiver_id: row.user_id,
      email: context.recipient.email,
      subject,
      content: htmlContent,
      source_name: sourceInfo.sourceName,
      source_email: sourceInfo.sourceEmail,
    })
    .select('id')
    .single();

  if (sentInsertError) throw sentInsertError;

  await sbAdmin
    .from('user_group_post_checks')
    .update({ email_id: sentEmail.id })
    .eq('post_id', row.post_id)
    .eq('user_id', row.user_id);

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

  const email = check.user?.email as string | undefined;
  if (!isValidEmailAddress(email)) return null;

  return {
    post,
    recipient: {
      id: check.user_id,
      email,
      username:
        (check.user?.full_name as string | null) ||
        (check.user?.display_name as string | null) ||
        email,
      notes: check.notes,
      is_completed: check.is_completed,
    },
  };
}

async function processWithConcurrency(
  items: PostEmailQueueRow[],
  processor: (row: PostEmailQueueRow) => Promise<Record<string, unknown>>,
  concurrency: number,
  maxDurationMs: number,
  startTime: number
): Promise<{ results: Record<string, unknown>[]; timedOut: boolean }> {
  const results: Record<string, unknown>[] = [];
  let timedOut = false;

  for (let i = 0; i < items.length; i += concurrency) {
    if (Date.now() - startTime > maxDurationMs) {
      timedOut = true;
      break;
    }

    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((row) =>
        processor(row).catch((error) => ({
          id: row.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        }))
      )
    );
    results.push(...batchResults);
  }

  return { results, timedOut };
}

export async function processPostEmailQueueBatch(
  sbAdmin: any,
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

  let rows = prioritizePostEmailQueueBatch(
    (queuedData ?? []) as PostEmailQueueRow[],
    [],
    safeLimit
  );

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

    rows = prioritizePostEmailQueueBatch(
      (queuedData ?? []) as PostEmailQueueRow[],
      (failedData ?? []) as PostEmailQueueRow[],
      safeLimit
    );
  }

  if (rows.length === 0) {
    return {
      processed: 0,
      failed: 0,
      results: [] as Array<Record<string, unknown>>,
    };
  }

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const claimedRows: PostEmailQueueRow[] = [];

  for (const row of rows) {
    if (claimedRows.length >= safeSendLimit) break;
    if (Date.now() - startTime > maxDurationMs) break;

    const { error: claimError } = await getQueueTable(sbAdmin)
      .update({
        status: 'processing',
        batch_id: batchId,
        claimed_at: now,
        last_attempt_at: now,
        attempt_count: row.attempt_count + 1,
        cancelled_at: null,
      })
      .eq('id', row.id)
      .eq('status', row.status)
      .select('*')
      .maybeSingle();

    if (!claimError) {
      claimedRows.push({
        ...row,
        status: 'processing',
        batch_id: batchId,
        claimed_at: now,
        last_attempt_at: now,
        attempt_count: row.attempt_count + 1,
      });
    }
  }

  if (claimedRows.length === 0) {
    return {
      claimed: 0,
      failed: 0,
      results: [] as Array<Record<string, unknown>>,
    };
  }

  const prefetch = await prefetchBatchData(sbAdmin, claimedRows);

  const { results, timedOut } = await processWithConcurrency(
    claimedRows,
    async (row) => processEmailWithContext(sbAdmin, row, prefetch),
    safeConcurrency,
    maxDurationMs,
    startTime
  );

  const failed = results.filter((r) => r.status === 'failed').length;

  return {
    claimed: claimedRows.length,
    processed: results.length,
    failed,
    timedOut,
    results,
  };
}

export function prioritizePostEmailQueueBatch(
  queuedRows: PostEmailQueueRow[],
  failedRows: PostEmailQueueRow[],
  limit: number
) {
  return queuedRows.concat(failedRows).slice(0, Math.max(1, limit));
}
