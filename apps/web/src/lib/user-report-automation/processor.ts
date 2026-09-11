import { EmailService } from '@tuturuuu/email-service';
import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { loadReportEmailPreview } from '@tuturuuu/users-core/reports/email-preview';
import { isEmailBlacklisted } from '@/lib/email-blacklist';
import { createEmailUnsubscribeUrl } from '@/lib/email-unsubscribe';
import { resolvePeriodicReportEmailAccess } from './access';
import { loadScopedReportContext } from './context';
import { generatePeriodicReportNarrative } from './generation';
import { reconcilePeriodicReportSchedules } from './schedule-reconciliation';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

function getPrivateDb(client: AdminClient) {
  return client.schema('private');
}

type PrivateClient = ReturnType<typeof getPrivateDb>;

interface AutomationRun {
  attempt_count: number;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  generation_mode: 'manual' | 'ai';
  group_id: string | null;
  id: string;
  period_end: string;
  period_start: string;
  schedule_id: string;
  ws_id: string;
}

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

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  process: (item: T) => Promise<void>
) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await process(item);
      }
    }
  );
  await Promise.all(workers);
}

function getRetryAt(attemptCount: number) {
  const delayMinutes = Math.min(
    12 * 60,
    5 * 2 ** Math.max(0, attemptCount - 1)
  );
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function markRunFailure(
  privateDb: PrivateClient,
  run: AutomationRun,
  error: unknown
) {
  const message = error instanceof Error ? error.message : 'Unknown run error';
  const permanent = run.attempt_count >= 5;
  console.error('periodic_report.generation_failed', {
    runId: run.id,
    workspaceId: run.ws_id,
    attempt: run.attempt_count,
    permanent,
  });
  await privateDb
    .from('user_report_automation_runs')
    .update({
      last_error: message,
      locked_at: null,
      locked_by: null,
      next_attempt_at: getRetryAt(run.attempt_count),
      status: permanent ? 'cancelled' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);
}

async function processAutomationRun(sbAdmin: AdminClient, run: AutomationRun) {
  const privateDb = getPrivateDb(sbAdmin);
  try {
    if (!run.group_id) throw new Error('Automation run has no group scope');
    const [scheduleResult, membershipsResult, groupResult] = await Promise.all([
      privateDb
        .from('user_report_schedules')
        .select('created_by, manager_instruction')
        .eq('id', run.schedule_id)
        .single(),
      sbAdmin
        .from('workspace_user_groups_users')
        .select('user_id')
        .eq('group_id', run.group_id),
      sbAdmin
        .from('workspace_user_groups')
        .select('name')
        .eq('id', run.group_id)
        .single(),
    ]);
    if (scheduleResult.error) throw scheduleResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (groupResult.error) throw groupResult.error;

    const userIds = (membershipsResult.data ?? []).map(
      (membership) => membership.user_id
    );
    const usersResult =
      userIds.length > 0
        ? await sbAdmin
            .from('workspace_users')
            .select('id, display_name, full_name, note')
            .eq('ws_id', run.ws_id)
            .in('id', userIds)
            .eq('archived', false)
        : { data: [], error: null };
    if (usersResult.error) throw usersResult.error;

    let createdReports = 0;
    for (const user of usersResult.data ?? []) {
      const existing = await privateDb
        .from('external_user_monthly_reports')
        .select('id, generation_status')
        .eq('user_id', user.id)
        .eq('group_id', run.group_id)
        .eq('cadence', run.cadence)
        .eq('period_start', run.period_start)
        .eq('period_end', run.period_end)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (
        existing.data &&
        (run.generation_mode !== 'ai' ||
          !['failed', 'generating'].includes(existing.data.generation_status))
      )
        continue;

      const userName = user.display_name ?? user.full_name ?? 'Member';
      const title = `${run.cadence[0]?.toUpperCase()}${run.cadence.slice(1)} report · ${userName}`;
      const created = existing.data
        ? await privateDb
            .from('external_user_monthly_reports')
            .update({
              generation_status: 'generating',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.data.id)
            .eq('generation_status', existing.data.generation_status)
            .select('id')
            .maybeSingle()
        : await privateDb
            .from('external_user_monthly_reports')
            .insert({
              cadence: run.cadence,
              content: '',
              creator_id: scheduleResult.data.created_by,
              feedback: '',
              generation_mode: run.generation_mode,
              generation_status:
                run.generation_mode === 'ai' ? 'generating' : 'draft',
              group_id: run.group_id,
              manager_instruction: scheduleResult.data.manager_instruction,
              period_end: run.period_end,
              period_start: run.period_start,
              report_approval_status: 'PENDING',
              source_context: { automation_run_id: run.id, metrics: {} },
              title,
              updated_at: new Date().toISOString(),
              updated_by: scheduleResult.data.created_by,
              user_id: user.id,
            })
            .select('id')
            .single();
      if (created.error) throw created.error;
      if (!created.data) continue;
      if (!existing.data) createdReports++;

      if (run.generation_mode === 'ai') {
        try {
          const scopedContext = await loadScopedReportContext(sbAdmin, {
            cadence: run.cadence,
            groupId: run.group_id,
            periodEnd: run.period_end,
            periodStart: run.period_start,
            reportId: created.data.id,
            userId: user.id,
            wsId: run.ws_id,
          });
          const narrative = await generatePeriodicReportNarrative({
            cadence: run.cadence,
            deterministicMetrics: scopedContext.deterministicMetrics,
            group: { id: run.group_id, name: groupResult.data.name },
            managerInstruction: scheduleResult.data.manager_instruction,
            periodEnd: run.period_end,
            periodStart: run.period_start,
            previousReport: scopedContext.previousReport,
            subject: {
              displayName: user.display_name,
              fullName: user.full_name,
              note: user.note,
            },
          });
          const generated = await privateDb
            .from('external_user_monthly_reports')
            .update({
              content: narrative.content,
              feedback: narrative.feedback,
              generation_status: 'ready',
              report_approval_status: 'PENDING',
              source_context: {
                automation_run_id: run.id,
                metrics: scopedContext.deterministicMetrics,
              },
              title: narrative.title,
              updated_at: new Date().toISOString(),
            })
            .eq('id', created.data.id);
          if (generated.error) throw generated.error;
        } catch (error) {
          const failed = await privateDb
            .from('external_user_monthly_reports')
            .update({
              generation_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', created.data.id);
          if (failed.error)
            console.error('periodic_report.generation_status_write_failed', {
              reportId: created.data.id,
              runId: run.id,
              error: failed.error,
            });
          throw error;
        }
      }
    }

    const completed = await privateDb
      .from('user_report_automation_runs')
      .update({
        completed_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        locked_by: null,
        result: { created_reports: createdReports },
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (completed.error) throw completed.error;
  } catch (error) {
    await markRunFailure(privateDb, run, error);
  }
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
    const [reportResult, userResult, workspaceResult, sourceResult] =
      await Promise.all([
        privateDb
          .from('external_user_monthly_reports')
          .select('id, title, content, feedback, report_approval_status')
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
    const sendResult = await service.send({
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
    });
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
  const [runsResult, emailsResult] = await Promise.all([
    callPrivateRpc<AutomationRun>(privateDb, 'claim_periodic_report_runs', {
      p_limit: 8,
      p_now: new Date().toISOString(),
      p_worker_id: workerId,
    }),
    migrationPending
      ? Promise.resolve({ data: [] as EmailQueueRow[], error: null })
      : callPrivateRpc<EmailQueueRow>(
          privateDb,
          'claim_periodic_report_emails',
          {
            p_limit: 12,
            p_now: new Date().toISOString(),
            p_worker_id: workerId,
          }
        ),
  ]);
  if (runsResult.error) throw new Error(runsResult.error.message);
  if (emailsResult.error) throw new Error(emailsResult.error.message);
  const runs = runsResult.data ?? [];
  const emails = emailsResult.data ?? [];

  await processWithConcurrency(runs, 3, (run) =>
    processAutomationRun(sbAdmin, run)
  );
  await processWithConcurrency(emails, 4, (row) =>
    processEmailQueueRow(sbAdmin, row)
  );

  return {
    ...reconciliation,
    processedEmails: emails.length,
    processedRuns: runs.length,
  };
}
