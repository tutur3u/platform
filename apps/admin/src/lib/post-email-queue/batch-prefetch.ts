import { EmailService } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import type {
  BatchPrefetchContext,
  BatchSourceInfo,
  PostEmailQueueRow,
  PrefetchCheckRow,
  PrefetchedPost,
  PrefetchedPostCheck,
  PrefetchedSentEmail,
  PrefetchedSentEmailAudit,
  PrefetchPostRow,
  PrefetchSentEmailAuditRow,
  PrefetchSentEmailRow,
} from './types';
import { chunkArray } from './utils';

const PREFETCH_QUERY_CHUNK_SIZE = 200;

function createPostUserKey(postId: string, userId: string): string {
  return `${postId}:${userId}`;
}

function createPostRecipientKey(postId: string, email: string): string {
  return `${postId}:${email.trim().toLowerCase()}`;
}

export async function prefetchBatchData(
  sbAdmin: TypedSupabaseClient,
  rows: PostEmailQueueRow[]
): Promise<BatchPrefetchContext> {
  const startTime = Date.now();
  const postIds = [...new Set(rows.map((row) => row.post_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const wsIds = [...new Set(rows.map((row) => row.ws_id))];

  console.info('[PostEmailQueueBatch] Prefetching batch data', {
    rowCount: rows.length,
    uniquePosts: postIds.length,
    uniqueUsers: userIds.length,
    uniqueWorkspaces: wsIds.length,
  });

  const postRows: PrefetchPostRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    const { data, error } = await sbAdmin
      .schema('private')
      .from('user_group_posts')
      .select(
        'id, group_id, title, content, created_at, workspace_user_groups!inner(ws_id, name)'
      )
      .in('id', postChunk);

    if (error) throw error;
    postRows.push(...((data ?? []) as unknown as PrefetchPostRow[]));
  }

  const checkRows: PrefetchCheckRow[] = [];
  for (const postChunk of chunkArray(postIds, PREFETCH_QUERY_CHUNK_SIZE)) {
    for (const userChunk of chunkArray(userIds, PREFETCH_QUERY_CHUNK_SIZE)) {
      const { data, error } = await sbAdmin
        .schema('private')
        .from('user_group_post_checks')
        .select(
          'post_id, user_id, notes, is_completed, approval_status, user:workspace_users!user_id!inner(id, email, full_name, display_name, ws_id, archived, archived_until)'
        )
        .in('post_id', postChunk)
        .in('user_id', userChunk);

      if (error) throw error;
      checkRows.push(...((data ?? []) as unknown as PrefetchCheckRow[]));
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
    const group = Array.isArray(post.workspace_user_groups)
      ? post.workspace_user_groups[0]
      : post.workspace_user_groups;
    if (!group) continue;
    posts.set(post.id, {
      id: post.id,
      group_id: post.group_id,
      title: post.title,
      content: post.content,
      created_at: post.created_at,
      group_name: group.name,
      ws_id: group.ws_id,
    });
  }

  const checks = new Map<string, PrefetchedPostCheck>();
  for (const check of checkRows) {
    const post = posts.get(check.post_id);
    if (!post || check.user?.ws_id !== post.ws_id) {
      continue;
    }
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
    [...checks.values()].map((check) => check.user?.email ?? null)
  );
  const blockedRecipientEmails = new Set(
    [...blockedEmailCache.entries()]
      .filter(([, isBlocked]) => isBlocked)
      .map(([email]) => email)
  );

  const emailServices = new Map<string, EmailService>();
  const sourceInfos = new Map<string, BatchSourceInfo>();
  const workspaceTimezones = new Map<string, string | null>();

  for (const wsId of wsIds) {
    emailServices.set(wsId, await EmailService.fromWorkspace(wsId));

    const { data: workspace, error: workspaceError } = await sbAdmin
      .from('workspaces')
      .select('timezone')
      .eq('id', wsId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;

    workspaceTimezones.set(wsId, workspace?.timezone ?? null);

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

  console.info('[PostEmailQueueBatch] Prefetch complete', {
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
    workspaceTimezones,
  };

  return batchPrefetch;
}
