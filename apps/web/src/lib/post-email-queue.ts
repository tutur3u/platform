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

export const POST_EMAIL_MAX_AGE_DAYS = 7;

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
      return existing?.status !== 'sent' && existing?.status !== 'processing';
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

async function buildPostSendContext(
  sbAdmin: any,
  queueRow: PostEmailQueueRow
): Promise<PostSendContext | null> {
  const { data: post, error: postError } = await sbAdmin
    .from('user_group_posts')
    .select(
      'id, group_id, title, content, notes, created_at, workspace_user_groups!inner(ws_id, name)'
    )
    .eq('id', queueRow.post_id)
    .maybeSingle();

  if (postError) throw postError;
  if (!post) return null;

  if (post.created_at) {
    const cutoff = getPostEmailMaxAgeCutoff();
    if (post.created_at < cutoff) {
      return null;
    }
  }

  const { data: check, error: checkError } = await sbAdmin
    .from('user_group_post_checks')
    .select(
      'user_id, notes, is_completed, approval_status, user:workspace_users!user_id!inner(id, email, full_name, display_name)'
    )
    .eq('post_id', queueRow.post_id)
    .eq('user_id', queueRow.user_id)
    .maybeSingle();

  if (checkError) throw checkError;
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
    post: {
      id: post.id,
      ws_id: queueRow.ws_id,
      group_id: queueRow.group_id,
      title: post.title,
      content: post.content,
      notes: post.notes,
      created_at: post.created_at,
      post_approval_status: 'APPROVED',
      group_name: Array.isArray(post.workspace_user_groups)
        ? post.workspace_user_groups[0]?.name
        : post.workspace_user_groups?.name,
    } as unknown as UserGroupPost & { group_name?: string | null },
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

async function getWorkspaceSourceInfo(
  sbAdmin: any,
  wsId: string
): Promise<{ sourceName: string; sourceEmail: string }> {
  const { data } = await sbAdmin
    .from('workspace_email_credentials')
    .select('source_name, source_email')
    .eq('ws_id', wsId)
    .maybeSingle();

  return {
    sourceName: data?.source_name || 'Tuturuuu',
    sourceEmail: data?.source_email || 'notifications@tuturuuu.com',
  };
}

export async function processPostEmailQueueBatch(
  sbAdmin: any,
  { limit = 25 }: { limit?: number } = {}
) {
  const { data, error } = await getQueueTable(sbAdmin)
    .select('*')
    .in('status', ['queued', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as PostEmailQueueRow[];
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

  const serviceCache = new Map<string, EmailService>();
  const sourceInfoCache = new Map<
    string,
    { sourceName: string; sourceEmail: string }
  >();
  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const row of claimedRows) {
    try {
      const context = await buildPostSendContext(sbAdmin, row);

      if (!context) {
        const cutoff = getPostEmailMaxAgeCutoff();
        const isOld = await sbAdmin
          .from('user_group_posts')
          .select('created_at')
          .eq('id', row.post_id)
          .lt('created_at', cutoff)
          .maybeSingle()
          .then(({ data }: any) => !!data);

        await markQueueRow(sbAdmin, row.id, {
          status: isOld ? 'skipped' : 'cancelled',
          batch_id: null,
          cancelled_at: new Date().toISOString(),
          last_error: isOld
            ? `Post older than ${POST_EMAIL_MAX_AGE_DAYS} days`
            : 'Post is no longer approved or recipient is no longer eligible.',
        });
        results.push({
          id: row.id,
          status: isOld ? 'skipped' : 'cancelled',
        });
        continue;
      }

      const { data: existingSentEmail, error: sentLookupError } = await sbAdmin
        .from('sent_emails')
        .select('id, created_at')
        .eq('post_id', row.post_id)
        .eq('receiver_id', row.user_id)
        .maybeSingle();

      if (sentLookupError) throw sentLookupError;

      if (existingSentEmail) {
        await markQueueRow(sbAdmin, row.id, {
          status: 'sent',
          batch_id: null,
          sent_at: existingSentEmail.created_at,
          sent_email_id: existingSentEmail.id,
          last_error: null,
        });
        results.push({ id: row.id, status: 'sent', deduped: true });
        continue;
      }

      let emailService = serviceCache.get(row.ws_id);
      if (!emailService) {
        emailService = await EmailService.fromWorkspace(row.ws_id);
        serviceCache.set(row.ws_id, emailService);
      }

      let sourceInfo = sourceInfoCache.get(row.ws_id);
      if (!sourceInfo) {
        sourceInfo = await getWorkspaceSourceInfo(sbAdmin, row.ws_id);
        sourceInfoCache.set(row.ws_id, sourceInfo);
      }

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
        failed += 1;
        results.push({
          id: row.id,
          status: blockedRecipient ? 'blocked' : 'failed',
        });
        continue;
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

      results.push({ id: row.id, status: 'sent' });
    } catch (error) {
      failed += 1;
      await markQueueRow(sbAdmin, row.id, {
        status: 'failed',
        batch_id: null,
        last_error: error instanceof Error ? error.message : 'Unknown error',
      });
      results.push({
        id: row.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    processed: claimedRows.length,
    failed,
    results,
  };
}
