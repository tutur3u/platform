import { EmailService } from '@tuturuuu/email-service';
import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function reportHtml(report: {
  content: string;
  feedback: string;
  title: string;
}) {
  return [
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<div>${escapeHtml(report.content).replaceAll('\n', '<br />')}</div>`,
    report.feedback
      ? `<h2>Next steps</h2><div>${escapeHtml(report.feedback).replaceAll('\n', '<br />')}</div>`
      : '',
  ].join('');
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
        .select('id')
        .eq('user_id', user.id)
        .eq('group_id', run.group_id)
        .eq('cadence', run.cadence)
        .eq('period_start', run.period_start)
        .eq('period_end', run.period_end)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) continue;

      const userName = user.display_name ?? user.full_name ?? 'Member';
      const title = `${run.cadence[0]?.toUpperCase()}${run.cadence.slice(1)} report · ${userName}`;
      const created = await privateDb
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
      createdReports++;

      if (run.generation_mode === 'ai') {
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
  await privateDb.from('user_report_email_attempts').insert({
    error_message: details?.error ?? null,
    provider_message_id: details?.providerMessageId ?? null,
    queue_id: row.id,
    status,
  });
}

async function processEmailQueueRow(sbAdmin: AdminClient, row: EmailQueueRow) {
  const privateDb = getPrivateDb(sbAdmin);
  const fail = async (
    status: 'failed' | 'blocked',
    message: string,
    permanent = false
  ) => {
    await recordEmailAttempt(privateDb, row, status, { error: message });
    await privateDb
      .from('user_report_email_queue')
      .update({
        last_error: message,
        locked_at: null,
        locked_by: null,
        next_attempt_at: getRetryAt(row.attempt_count),
        status: permanent || row.attempt_count >= 5 ? 'blocked' : 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    await privateDb
      .from('external_user_monthly_reports')
      .update({
        delivery_status: permanent ? 'blocked' : 'failed',
        last_delivery_error: message,
      })
      .eq('id', row.report_id);
  };

  try {
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
    if (await isEmailBlacklisted(sbAdmin, recipient)) {
      await fail('blocked', 'Recipient is unsubscribed or blocked.', true);
      return;
    }

    const html = reportHtml(reportResult.data);
    const unsubscribeUrl = createEmailUnsubscribeUrl(recipient);
    const service = await EmailService.fromWorkspace(row.ws_id);
    const sendResult = await service.send({
      content: {
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html,
        subject: reportResult.data.title,
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

    const sentAt = new Date().toISOString();
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
      subject: reportResult.data.title,
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
    await privateDb
      .from('user_report_email_queue')
      .update({
        last_error: null,
        locked_at: null,
        locked_by: null,
        provider_message_id: sendResult.messageId,
        sent_at: sentAt,
        status: 'sent',
        updated_at: sentAt,
      })
      .eq('id', row.id);
    await privateDb
      .from('external_user_monthly_reports')
      .update(
        row.delivery_kind === 'test'
          ? {
              delivery_status: 'draft',
              last_delivery_error: null,
            }
          : {
              delivered_at: sentAt,
              delivery_status: 'sent',
              last_delivery_error: null,
            }
      )
      .eq('id', row.report_id);
  } catch (error) {
    await fail(
      'failed',
      error instanceof Error ? error.message : 'Unknown delivery error'
    );
  }
}

export async function processPeriodicReportAutomation(
  sbAdmin: AdminClient,
  workerId: string
) {
  const reconciliation = await reconcilePeriodicReportSchedules(sbAdmin);
  const privateDb = getPrivateDb(sbAdmin);
  const [runsResult, emailsResult] = await Promise.all([
    callPrivateRpc<AutomationRun>(privateDb, 'claim_periodic_report_runs', {
      p_limit: 8,
      p_now: new Date().toISOString(),
      p_worker_id: workerId,
    }),
    callPrivateRpc<EmailQueueRow>(privateDb, 'claim_periodic_report_emails', {
      p_limit: 12,
      p_now: new Date().toISOString(),
      p_worker_id: workerId,
    }),
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
