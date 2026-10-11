import { EmailService } from '@tuturuuu/email-service';
import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { loadReportEmailPreview } from '@tuturuuu/users-core/reports/email-preview';
import {
  reportReplyReceivingReady,
  sendReportEmail,
} from '@tuturuuu/users-core/reports/email-reply-identity';
import type { ReportEmailReplyRpc } from '@tuturuuu/users-core/reports/email-reply-types';
import { isEmailBlacklisted } from '@/lib/email-blacklist';
import { createEmailUnsubscribeUrl } from '@/lib/email-unsubscribe';
import { resolvePeriodicReportEmailAccess } from './access';
import {
  drainEmailQueue,
  EMAIL_CLAIM_SIZE,
  EmailQueueDrainError,
  processWithConcurrency,
} from './email-queue-drain';
import {
  type AutomationRun,
  getRetryAt,
  processAutomationRun,
} from './processor-generation';
import { reconcilePeriodicReportSchedules } from './schedule-reconciliation';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

function getPrivateDb(client: AdminClient) {
  return client.schema('private');
}

type PrivateClient = ReturnType<typeof getPrivateDb>;

interface EmailQueueRow {
  locked_at: string;
  locked_by: string;
  attempt_count: number;
  delivery_kind: 'send' | 'test';
  id: string;
  recipient_email: string;
  report_id: string;
  user_id: string;
  ws_id: string;
}

type RpcResult<T> = Promise<{
  data: T[] | null;
  error: { message: string } | null;
}>;

function callPrivateRpc<T>(
  client: PrivateClient,
  name: string,
  args: Record<string, unknown>
) {
  return (
    client.rpc as unknown as (
      fn: string,
      values: Record<string, unknown>
    ) => RpcResult<T>
  )(name, args);
}

async function recordEmailAttempt(
  privateDb: PrivateClient,
  row: EmailQueueRow,
  status: 'sent' | 'failed' | 'blocked',
  details?: { error?: string; providerMessageId?: string }
) {
  const result = await privateDb.from('user_report_email_attempts').insert({
    error_message: details?.error ?? null,
    provider_message_id: details?.providerMessageId ?? null,
    queue_id: row.id,
    status,
  });
  if (result.error) throw result.error;
}

async function hasEmailLease(privateDb: PrivateClient, row: EmailQueueRow) {
  const lease = await privateDb
    .from('user_report_email_queue')
    .select('id')
    .eq('id', row.id)
    .eq('status', 'processing')
    .eq('locked_by', row.locked_by)
    .eq('locked_at', row.locked_at)
    .gt('locked_at', new Date(Date.now() - 15 * 60_000).toISOString())
    .maybeSingle();
  if (lease.error) throw lease.error;
  if (!lease.data)
    console.warn('periodic_report.lease_lost', {
      queueId: row.id,
      reportId: row.report_id,
      workspaceId: row.ws_id,
    });
  return Boolean(lease.data);
}

async function processEmailQueueRow(sbAdmin: AdminClient, row: EmailQueueRow) {
  const privateDb = getPrivateDb(sbAdmin);
  let providerAccepted = false;
  let acceptedAt: string | null = null;
  let acceptedMessageId: string | undefined;
  let attemptedRecipient = row.recipient_email;
  const fail = async (
    status: 'failed' | 'blocked',
    message: string,
    permanent = false
  ) => {
    const blocked = permanent || providerAccepted || row.attempt_count >= 5;
    console.warn('periodic_report.delivery_failed', {
      queueId: row.id,
      reportId: row.report_id,
      workspaceId: row.ws_id,
      attempt: row.attempt_count,
      status: blocked ? 'blocked' : status,
      providerAccepted,
    });
    try {
      await recordEmailAttempt(privateDb, row, blocked ? 'blocked' : status, {
        error: message,
        providerMessageId: acceptedMessageId,
      });
    } catch (error) {
      console.error('periodic_report.attempt_write_failed', {
        queueId: row.id,
        error,
      });
    }
    const completion = await privateDb.rpc('finish_periodic_report_email', {
      p_queue_id: row.id,
      p_worker_id: row.locked_by,
      p_locked_at: row.locked_at,
      p_status: blocked ? 'blocked' : 'failed',
      p_recipient_email: attemptedRecipient,
      p_error: message,
      p_next_attempt_at: getRetryAt(row.attempt_count),
      ...(acceptedAt ? { p_sent_at: acceptedAt } : {}),
      ...(acceptedMessageId
        ? { p_provider_message_id: acceptedMessageId }
        : {}),
    });
    if (completion.error || !completion.data) {
      console.error('periodic_report.failure_lease_write_failed', {
        queueId: row.id,
        reportId: row.report_id,
        error: completion.error,
      });
    }
  };

  try {
    if (!(await hasEmailLease(privateDb, row))) return;
    const access = await resolvePeriodicReportEmailAccess(row.ws_id);
    if (!access.allowed) {
      await fail('blocked', `Delivery gate blocked: ${access.reason}`, true);
      return;
    }
    const replyRpc: ReportEmailReplyRpc = (name, args) =>
      (privateDb.rpc as unknown as ReportEmailReplyRpc)(name, args);
    const replyReady =
      process.env.REPORT_EMAIL_REPLY_IDENTITY_ENABLED === 'true' &&
      (await reportReplyReceivingReady(replyRpc));
    // Capture revision before all report reads/rendering. Disabled/unready sends
    // retain their existing schema dependencies and never read identity columns.
    const replyRevision = replyReady
      ? await privateDb
          .from('external_user_monthly_reports')
          .select('review_revision')
          .eq('id', row.report_id)
          .single()
      : null;
    if (replyRevision?.error) throw replyRevision.error;
    const [reportResult, userResult, workspaceResult, sourceResult] =
      await Promise.all([
        privateDb
          .from('external_user_monthly_reports')
          .select(
            'id, user_id, title, content, feedback, report_approval_status'
          )
          .eq('id', row.report_id)
          .single(),
        sbAdmin
          .from('workspace_users')
          .select('email')
          .eq('id', row.user_id)
          .eq('ws_id', row.ws_id)
          .single(),
        sbAdmin
          .from('workspaces')
          .select('creator_id')
          .eq('id', row.ws_id)
          .single(),
        sbAdmin
          .from('workspace_email_credentials')
          .select('source_name, source_email')
          .eq('ws_id', row.ws_id)
          .maybeSingle(),
      ]);
    if (reportResult.error) throw reportResult.error;
    if (userResult.error) throw userResult.error;
    if (workspaceResult.error) throw workspaceResult.error;
    if (sourceResult.error) throw sourceResult.error;
    if (reportResult.data.user_id !== row.user_id) {
      await fail(
        'blocked',
        'Report subject changed. Request a new delivery.',
        true
      );
      return;
    }
    if (reportResult.data.report_approval_status !== 'APPROVED') {
      await fail('blocked', 'Report is not approved.', true);
      return;
    }

    const recipient = userResult.data.email?.trim().toLowerCase();
    if (!recipient) {
      await fail('blocked', 'Subject profile email is missing.', true);
      return;
    }
    attemptedRecipient = recipient;
    if (await isEmailBlacklisted(sbAdmin, recipient)) {
      await fail('blocked', 'Recipient is unsubscribed or blocked.', true);
      return;
    }

    const { html, approvalStatus } = await loadReportEmailPreview(
      sbAdmin,
      row.ws_id,
      row.report_id
    );
    if (approvalStatus !== 'APPROVED') {
      await fail('blocked', 'Report approval changed before rendering.', true);
      return;
    }
    const unsubscribeUrl = createEmailUnsubscribeUrl(recipient);
    const service = await EmailService.fromWorkspace(row.ws_id);
    if (!(await hasEmailLease(privateDb, row))) return;
    const subject =
      row.delivery_kind === 'test'
        ? `[TEST] ${reportResult.data.title}`
        : reportResult.data.title;
    const delivery = await sendReportEmail(
      service,
      {
        content: {
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          html,
          subject,
        },
        metadata: {
          entityId: row.report_id,
          entityType: 'periodic-report',
          priority: 'normal',
          templateType: 'periodic-user-report',
          userId: workspaceResult.data.creator_id,
          wsId: row.ws_id,
        },
        recipients: { to: [recipient] },
      },
      replyRpc,
      {
        queueId: row.id,
        wsId: row.ws_id,
        reportId: row.report_id,
        subjectUserId: row.user_id,
        workerId: row.locked_by,
        lockedAt: row.locked_at,
        recipient,
        reviewRevision: replyRevision?.data?.review_revision ?? 0,
        deliveryKind: row.delivery_kind,
      }
    );
    const { sendResult } = delivery;
    if (sendResult.deliveryOutcome === 'unknown') {
      await fail(
        'blocked',
        'Email delivery outcome is unknown. Check provider logs before retrying.',
        true
      );
      return;
    }
    if (!sendResult.success) {
      const blocked = Boolean(sendResult.blockedRecipients?.length);
      await fail(
        blocked ? 'blocked' : 'failed',
        sendResult.error ?? 'Email provider rejected the delivery.',
        blocked
      );
      return;
    }

    providerAccepted = true;
    const sentAt = new Date().toISOString();
    acceptedAt = sentAt;
    acceptedMessageId = sendResult.messageId;
    if (delivery.trackingError)
      throw new Error('Report reply acceptance tracking failed');
    await recordEmailAttempt(privateDb, row, 'sent', {
      providerMessageId: sendResult.messageId,
    });
    const auditResult = await sbAdmin.from('sent_emails').insert({
      content: html,
      email: recipient,
      post_id: null,
      receiver_id: row.user_id,
      sender_id: workspaceResult.data.creator_id,
      source_email:
        sourceResult.data?.source_email ?? 'notifications@tuturuuu.com',
      source_name: sourceResult.data?.source_name ?? 'Tuturuuu',
      subject,
      ws_id: row.ws_id,
    });
    if (auditResult.error) {
      console.error('Periodic report email sent but audit insert failed:', {
        error: auditResult.error,
        queueId: row.id,
        reportId: row.report_id,
        workspaceId: row.ws_id,
      });
    }
    const completion = await privateDb.rpc('finish_periodic_report_email', {
      p_queue_id: row.id,
      p_worker_id: row.locked_by,
      p_locked_at: row.locked_at,
      p_status: 'sent',
      p_recipient_email: recipient,
      p_sent_at: sentAt,
      ...(sendResult.messageId
        ? { p_provider_message_id: sendResult.messageId }
        : {}),
    });
    if (completion.error) throw completion.error;
    if (!completion.data) {
      console.warn('periodic_report.accepted_after_lease_lost', {
        queueId: row.id,
        providerMessageId: sendResult.messageId,
      });
      return;
    }
    await delivery.applicationSent?.();
    console.info('periodic_report.delivery_sent', {
      queueId: row.id,
      reportId: row.report_id,
      workspaceId: row.ws_id,
      attempt: row.attempt_count,
      deliveryKind: row.delivery_kind,
      providerMessageId: sendResult.messageId,
    });
  } catch (error) {
    await fail(
      'failed',
      providerAccepted
        ? 'Provider accepted the email, but delivery tracking failed. Check provider logs before retrying.'
        : error instanceof Error
          ? error.message
          : 'Unknown delivery error'
    );
  }
}

export async function processPeriodicReportAutomation(
  sbAdmin: AdminClient,
  workerId: string
) {
  const reconciliation = await reconcilePeriodicReportSchedules(sbAdmin);
  const privateDb = getPrivateDb(sbAdmin);
  // New app deployments must not emit markers before the database guards exist.
  const contract = await (
    privateDb.rpc as unknown as (name: string) => Promise<{
      data: boolean | null;
      error: { code?: string } | null;
    }>
  )('periodic_report_delivery_contract_ready');
  if (contract.error || contract.data !== true) {
    console.warn('periodic_report.delivery_contract_unavailable');
    return { ...reconciliation, processedEmails: 0, processedRuns: 0 };
  }
  // Probe with a nonexistent queue before claiming anything: app deployment may
  // precede the migration that supplies atomic, lease-fenced completion.
  const readiness = await privateDb.rpc('finish_periodic_report_email', {
    p_queue_id: '00000000-0000-0000-0000-000000000000',
    p_worker_id: workerId,
    p_locked_at: new Date().toISOString(),
    p_status: 'blocked',
    p_recipient_email: '',
  });
  const migrationPending =
    readiness.error && ['42883', 'PGRST202'].includes(readiness.error.code);
  if (readiness.error && !migrationPending)
    throw new Error(readiness.error.message);
  if (migrationPending)
    console.warn('periodic_report.delivery_migration_pending');
  const emailDrain = migrationPending
    ? {
        processedEmails: 0,
        emailBatches: 0,
        emailDrainStopReason: 'migration_pending' as const,
      }
    : await drainEmailQueue<EmailQueueRow>({
        claim: async () => {
          const result = await callPrivateRpc<EmailQueueRow>(
            privateDb,
            'claim_periodic_report_emails',
            {
              p_limit: EMAIL_CLAIM_SIZE,
              p_now: new Date().toISOString(),
              p_worker_id: workerId,
            }
          );
          if (result.error) throw new Error(result.error.message);
          return result.data ?? [];
        },
        processBatch: (rows) =>
          processWithConcurrency(rows, 4, (row) =>
            processEmailQueueRow(sbAdmin, row)
          ),
      }).catch((error: unknown) => {
        if (error instanceof EmailQueueDrainError) {
          console.error('periodic_report.email_drain_failed', {
            processedEmails: error.processedEmails,
            emailBatches: error.emailBatches,
            stage: error.stage,
          });
        }
        throw error;
      });
  // Do not reserve email leases while generation (including AI) is running.
  // Generation claims remain one batch per invocation and settle as before.
  const runsResult = await callPrivateRpc<AutomationRun>(
    privateDb,
    'claim_periodic_report_runs',
    {
      p_limit: 8,
      p_now: new Date().toISOString(),
      p_worker_id: workerId,
    }
  );
  if (runsResult.error) throw new Error(runsResult.error.message);
  const runs = runsResult.data ?? [];
  await processWithConcurrency(runs, 3, (run) =>
    processAutomationRun(sbAdmin, run)
  );

  return {
    ...reconciliation,
    ...emailDrain,
    processedRuns: runs.length,
  };
}
