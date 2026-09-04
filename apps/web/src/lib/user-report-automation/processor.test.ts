import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const fromWorkspace = vi.fn();
const isEmailBlacklisted = vi.fn();
const resolvePeriodicReportEmailAccess = vi.fn();
const reconcilePeriodicReportSchedules = vi.fn();

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: { fromWorkspace: (wsId: string) => fromWorkspace(wsId) },
}));
vi.mock('@/lib/email-blacklist', () => ({
  isEmailBlacklisted: (...args: unknown[]) => isEmailBlacklisted(...args),
}));
vi.mock('@/lib/email-unsubscribe', () => ({
  createEmailUnsubscribeUrl: (email: string) =>
    `https://tuturuuu.com/unsubscribe/${email}`,
}));
vi.mock('./access', () => ({
  resolvePeriodicReportEmailAccess: (wsId: string) =>
    resolvePeriodicReportEmailAccess(wsId),
}));
vi.mock('./schedule-reconciliation', () => ({
  reconcilePeriodicReportSchedules: (...args: unknown[]) =>
    reconcilePeriodicReportSchedules(...args),
}));

import { processPeriodicReportAutomation } from './processor';

type Result = { data: unknown; error: unknown };
interface Write {
  op: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  table: string;
}

const QUEUE_ROW = {
  attempt_count: 0,
  delivery_kind: 'send' as const,
  id: 'queue-1',
  recipient_email: 'learner@example.com',
  report_id: 'report-1',
  user_id: 'user-1',
  ws_id: 'ws-1',
};

const APPROVED_REPORT = {
  content: 'Steady progress this month.',
  feedback: 'Keep practising past papers.',
  id: 'report-1',
  report_approval_status: 'APPROVED',
  title: 'Monthly report · Mai',
};

function createAdminClientStub(overrides: Record<string, Result> = {}) {
  const writes: Write[] = [];
  const reads: Record<string, Result> = {
    external_user_monthly_reports: { data: APPROVED_REPORT, error: null },
    sent_emails: { data: null, error: null },
    user_report_email_attempts: { data: null, error: null },
    user_report_email_queue: { data: null, error: null },
    workspace_email_credentials: {
      data: { source_email: 'reports@school.edu', source_name: 'School' },
      error: null,
    },
    workspace_users: { data: { email: 'Learner@Example.com ' }, error: null },
    workspaces: { data: { creator_id: 'creator-1' }, error: null },
    ...overrides,
  };

  /**
   * PostgREST-style chain over a real promise: every builder method returns the
   * same proxy, and awaiting it resolves the configured row for that table.
   * Proxying a Promise (instead of hand-rolling a `then`) keeps `await` and
   * `Promise.all` behaving exactly like the driver.
   */
  const makeBuilder = (table: string) => {
    const settled = Promise.resolve<Result>(
      reads[table] ?? { data: null, error: null }
    );
    const proxy: Record<string, unknown> = new Proxy(settled, {
      get(target, property) {
        if (
          property === 'then' ||
          property === 'catch' ||
          property === 'finally'
        ) {
          const member = Reflect.get(target, property, target);
          return typeof member === 'function' ? member.bind(target) : member;
        }

        return (payload: Record<string, unknown>) => {
          if (
            property === 'insert' ||
            property === 'update' ||
            property === 'upsert'
          ) {
            writes.push({ op: property, payload, table });
          }
          return proxy;
        };
      },
    }) as unknown as Record<string, unknown>;

    return proxy;
  };

  const privateSchema = {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string) =>
      Promise.resolve(
        name === 'claim_periodic_report_emails'
          ? { data: [QUEUE_ROW], error: null }
          : { data: [], error: null }
      ),
  };

  return {
    client: {
      from: (table: string) => makeBuilder(table),
      schema: () => privateSchema,
    },
    writes,
  };
}

function writesFor(writes: Write[], table: string) {
  return writes.filter((write) => write.table === table);
}

describe('periodic report email delivery', () => {
  beforeEach(() => {
    send.mockReset();
    fromWorkspace.mockReset();
    isEmailBlacklisted.mockReset();
    resolvePeriodicReportEmailAccess.mockReset();
    reconcilePeriodicReportSchedules.mockReset();

    reconcilePeriodicReportSchedules.mockResolvedValue({
      createdRuns: 0,
      dueSchedules: 0,
    });
    resolvePeriodicReportEmailAccess.mockResolvedValue({ allowed: true });
    isEmailBlacklisted.mockResolvedValue(false);
    fromWorkspace.mockResolvedValue({ send });
    send.mockResolvedValue({ messageId: 'provider-1', success: true });
  });

  it('sends an approved report and closes out the queue row', async () => {
    const { client, writes } = createAdminClientStub();

    await expect(
      processPeriodicReportAutomation(client as never, 'worker-1')
    ).resolves.toMatchObject({ processedEmails: 1, processedRuns: 0 });

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0];
    // The recipient is normalised from the workspace profile, not trusted from
    // the queue row, so a stale queue entry cannot redirect a delivery.
    expect(payload.recipients.to).toEqual(['learner@example.com']);
    expect(payload.content.subject).toBe(APPROVED_REPORT.title);
    expect(payload.content.headers['List-Unsubscribe']).toContain(
      'learner@example.com'
    );
    expect(payload.metadata).toMatchObject({
      entityId: 'report-1',
      templateType: 'periodic-user-report',
      wsId: 'ws-1',
    });

    expect(
      writesFor(writes, 'user_report_email_attempts')[0]?.payload
    ).toMatchObject({ provider_message_id: 'provider-1', status: 'sent' });
    expect(writesFor(writes, 'sent_emails')[0]?.payload).toMatchObject({
      email: 'learner@example.com',
      source_email: 'reports@school.edu',
      ws_id: 'ws-1',
    });
    expect(
      writesFor(writes, 'user_report_email_queue')[0]?.payload
    ).toMatchObject({ status: 'sent' });
    expect(
      writesFor(writes, 'external_user_monthly_reports')[0]?.payload
    ).toMatchObject({ delivery_status: 'sent', last_delivery_error: null });
  });

  it('escapes report content so a report body cannot inject markup', async () => {
    const { client } = createAdminClientStub({
      external_user_monthly_reports: {
        data: {
          ...APPROVED_REPORT,
          content: '<script>alert(1)</script>\nLine two',
        },
        error: null,
      },
    });

    await processPeriodicReportAutomation(client as never, 'worker-1');

    const html = send.mock.calls[0]?.[0].content.html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<br />');
  });

  it('blocks permanently when a workspace email gate is off', async () => {
    resolvePeriodicReportEmailAccess.mockResolvedValue({
      allowed: false,
      reason: 'periodic_email_disabled',
    });
    const { client, writes } = createAdminClientStub();

    await processPeriodicReportAutomation(client as never, 'worker-1');

    expect(send).not.toHaveBeenCalled();
    expect(
      writesFor(writes, 'user_report_email_queue')[0]?.payload
    ).toMatchObject({ status: 'blocked' });
    expect(
      writesFor(writes, 'external_user_monthly_reports')[0]?.payload
    ).toMatchObject({ delivery_status: 'blocked' });
    expect(
      writesFor(writes, 'user_report_email_attempts')[0]?.payload
    ).toMatchObject({ status: 'blocked' });
  });

  it('never emails a report that is still awaiting approval', async () => {
    const { client, writes } = createAdminClientStub({
      external_user_monthly_reports: {
        data: { ...APPROVED_REPORT, report_approval_status: 'PENDING' },
        error: null,
      },
    });

    await processPeriodicReportAutomation(client as never, 'worker-1');

    expect(send).not.toHaveBeenCalled();
    expect(
      writesFor(writes, 'user_report_email_attempts')[0]?.payload
    ).toMatchObject({
      error_message: 'Report is not approved.',
      status: 'blocked',
    });
  });

  it('blocks a missing subject email instead of sending to nobody', async () => {
    const { client, writes } = createAdminClientStub({
      workspace_users: { data: { email: '   ' }, error: null },
    });

    await processPeriodicReportAutomation(client as never, 'worker-1');

    expect(send).not.toHaveBeenCalled();
    expect(
      writesFor(writes, 'user_report_email_attempts')[0]?.payload
    ).toMatchObject({
      error_message: 'Subject profile email is missing.',
      status: 'blocked',
    });
  });

  it('respects an unsubscribed recipient', async () => {
    isEmailBlacklisted.mockResolvedValue(true);
    const { client, writes } = createAdminClientStub();

    await processPeriodicReportAutomation(client as never, 'worker-1');

    expect(send).not.toHaveBeenCalled();
    expect(
      writesFor(writes, 'external_user_monthly_reports')[0]?.payload
    ).toMatchObject({ delivery_status: 'blocked' });
  });

  it('retries a transient provider rejection but blocks a rejected recipient', async () => {
    send.mockResolvedValue({ error: 'SMTP timeout', success: false });
    const transient = createAdminClientStub();
    await processPeriodicReportAutomation(transient.client as never, 'w');
    expect(
      writesFor(transient.writes, 'user_report_email_queue')[0]?.payload
    ).toMatchObject({ last_error: 'SMTP timeout', status: 'failed' });

    send.mockResolvedValue({
      blockedRecipients: ['learner@example.com'],
      error: 'Recipient rejected',
      success: false,
    });
    const blocked = createAdminClientStub();
    await processPeriodicReportAutomation(blocked.client as never, 'w');
    expect(
      writesFor(blocked.writes, 'user_report_email_queue')[0]?.payload
    ).toMatchObject({ status: 'blocked' });
  });

  it('keeps a test delivery out of the report delivery history', async () => {
    const { client, writes } = createAdminClientStub();
    QUEUE_ROW.delivery_kind = 'test' as 'send';

    try {
      await processPeriodicReportAutomation(client as never, 'worker-1');

      expect(send).toHaveBeenCalledOnce();
      const reportUpdate = writesFor(writes, 'external_user_monthly_reports')[0]
        ?.payload;
      expect(reportUpdate).toMatchObject({ delivery_status: 'draft' });
      expect(reportUpdate).not.toHaveProperty('delivered_at');
    } finally {
      QUEUE_ROW.delivery_kind = 'send';
    }
  });
});
