import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const fromWorkspace = vi.fn();
const isEmailBlacklisted = vi.fn();
const resolvePeriodicReportEmailAccess = vi.fn();
const reconcilePeriodicReportSchedules = vi.fn();
const generateNarrative = vi.fn();

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

vi.mock('./context', () => ({
  loadScopedReportContext: async () => ({
    deterministicMetrics: {},
    previousReport: null,
  }),
}));
vi.mock('./generation', () => ({
  generatePeriodicReportNarrative: (...args: unknown[]) =>
    generateNarrative(...args),
}));

import { processPeriodicReportAutomation } from './processor';

type Result = { data: unknown; error: unknown };
interface Write {
  op: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  table: string;
}

const QUEUE_ROW = {
  locked_at: new Date().toISOString(),
  locked_by: 'worker-1',
  attempt_count: 0,
  delivery_kind: 'send' as 'send' | 'test',
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

function createAdminClientStub(
  overrides: Record<string, Result> = {},
  runs: unknown[] = [],
  writeResults: Record<string, Result> = {}
) {
  const writes: Write[] = [];
  const reads: Record<string, Result> = {
    external_user_monthly_reports: { data: APPROVED_REPORT, error: null },
    sent_emails: { data: null, error: null },
    user_report_email_attempts: { data: null, error: null },
    user_report_email_queue: { data: { id: 'queue-1' }, error: null },
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
  const makeBuilder = (table: string, result = reads[table]) => {
    const settled = Promise.resolve<Result>(
      result ?? { data: null, error: null }
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
            if (writeResults[table])
              return makeBuilder(table, writeResults[table]);
          }
          return proxy;
        };
      },
    }) as unknown as Record<string, unknown>;

    return proxy;
  };

  const privateSchema = {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'finish_periodic_report_email') {
        if (reads.finish_periodic_report_email)
          return Promise.resolve(reads.finish_periodic_report_email);
        if (args.p_queue_id === '00000000-0000-0000-0000-000000000000')
          return Promise.resolve({ data: false, error: null });
        if (
          args.p_worker_id !== QUEUE_ROW.locked_by ||
          args.p_locked_at !== QUEUE_ROW.locked_at
        )
          return Promise.resolve({ data: false, error: null });
        const lease = reads.user_report_email_queue;
        if (lease?.error || !lease?.data)
          return Promise.resolve({ data: false, error: lease?.error ?? null });
        writes.push({
          table: 'user_report_email_queue',
          op: 'update',
          payload: {
            status: args.p_status,
            last_error: args.p_error ?? null,
            recipient_email: args.p_recipient_email,
            sent_at: args.p_sent_at,
            provider_message_id: args.p_provider_message_id,
          },
        });
        writes.push({
          table: 'external_user_monthly_reports',
          op: 'update',
          payload: {
            delivery_status:
              args.p_status === 'sent' && QUEUE_ROW.delivery_kind === 'test'
                ? 'draft'
                : args.p_status,
            last_delivery_error: args.p_error ?? null,
            ...(QUEUE_ROW.delivery_kind === 'send' && args.p_sent_at
              ? { delivered_at: args.p_sent_at }
              : {}),
          },
        });
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve(
        name === 'claim_periodic_report_emails'
          ? {
              data:
                runs.length ||
                ['sent', 'blocked', 'cancelled'].includes(
                  String(
                    writesFor(writes, 'user_report_email_queue').at(-1)?.payload
                      .status
                  )
                )
                  ? []
                  : [{ ...QUEUE_ROW }],
              error: null,
            }
          : { data: runs, error: null }
      );
    },
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

  it('does not claim or send email before completion tracking is available', async () => {
    const { client, writes } = createAdminClientStub({
      finish_periodic_report_email: {
        data: null,
        error: { code: 'PGRST202', message: 'Missing completion RPC' },
      },
    });
    const result = await processPeriodicReportAutomation(
      client as never,
      'worker'
    );
    expect(result.processedEmails).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('does not start a delivery after its lease is lost', async () => {
    const { client, writes } = createAdminClientStub({
      user_report_email_queue: { data: null, error: null },
    });
    await processPeriodicReportAutomation(client as never, 'old-worker');
    expect(send).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('rechecks ownership after preparing the email provider', async () => {
    const lease: Result = { data: { id: 'queue-1' }, error: null };
    const { client, writes } = createAdminClientStub({
      user_report_email_queue: lease,
    });
    fromWorkspace.mockImplementation(async () => {
      lease.data = null;
      return { send };
    });
    await processPeriodicReportAutomation(client as never, 'old-worker');
    expect(send).not.toHaveBeenCalled();
    expect(writesFor(writes, 'external_user_monthly_reports')).toEqual([]);
  });

  it.each([true, false])(
    'does not overwrite report state after a lost completion lease (accepted=%s)',
    async (success) => {
      const lease: Result = { data: { id: 'queue-1' }, error: null };
      const { client, writes } = createAdminClientStub({
        user_report_email_queue: lease,
      });
      send.mockImplementation(async () => {
        lease.data = null;
        return {
          success,
          messageId: success ? 'accepted-old-attempt' : undefined,
          error: success ? undefined : 'Rejected',
        };
      });
      await processPeriodicReportAutomation(client as never, 'old-worker');
      expect(send).toHaveBeenCalledOnce();
      expect(writesFor(writes, 'external_user_monthly_reports')).toEqual([]);
      expect(
        writesFor(writes, 'user_report_email_attempts')[0]?.payload.status
      ).toBe(success ? 'sent' : 'failed');
    }
  );

  it.each(['locked_by', 'locked_at'] as const)(
    'cannot complete when the current lease changes %s during sending',
    async (field) => {
      const original = QUEUE_ROW[field];
      const { client, writes } = createAdminClientStub();
      send.mockImplementation(async () => {
        QUEUE_ROW[field] =
          field === 'locked_by'
            ? 'replacement-worker'
            : new Date(Date.now() + 1000).toISOString();
        return { success: true, messageId: 'accepted-old-attempt' };
      });
      try {
        await processPeriodicReportAutomation(client as never, 'old-worker');
        expect(send).toHaveBeenCalledOnce();
        expect(writesFor(writes, 'user_report_email_queue')).toEqual([]);
        expect(writesFor(writes, 'external_user_monthly_reports')).toEqual([]);
        expect(
          writesFor(writes, 'user_report_email_attempts')[0]?.payload.status
        ).toBe('sent');
      } finally {
        QUEUE_ROW[field] = original;
      }
    }
  );

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
      writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
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
      writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
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
      writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
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

  it('reports exhausted retries as blocked in both queue and report', async () => {
    const { client, writes } = createAdminClientStub();
    QUEUE_ROW.attempt_count = 5;
    send.mockResolvedValue({ success: false, error: 'Temporary outage' });
    try {
      await processPeriodicReportAutomation(client as never, 'worker');
      expect(
        writesFor(writes, 'user_report_email_queue')[0]?.payload.status
      ).toBe('blocked');
      expect(
        writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
          .delivery_status
      ).toBe('blocked');
    } finally {
      QUEUE_ROW.attempt_count = 0;
    }
  });

  it('does not retry an accepted email when writing its attempt fails', async () => {
    const { client, writes } = createAdminClientStub({
      user_report_email_attempts: {
        data: null,
        error: { message: 'database unavailable' },
      },
    });
    await processPeriodicReportAutomation(client as never, 'worker');
    await processPeriodicReportAutomation(client as never, 'worker-again');
    expect(send).toHaveBeenCalledOnce();
    expect(
      writesFor(writes, 'user_report_email_queue')[0]?.payload.status
    ).toBe('blocked');
    expect(
      writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
        .last_delivery_error
    ).toContain('Provider accepted');
    expect(
      writesFor(writes, 'user_report_email_queue')[0]?.payload.sent_at
    ).toEqual(expect.any(String));
    expect(
      writesFor(writes, 'user_report_email_attempts').at(-1)?.payload.status
    ).toBe('blocked');
  });

  it('retains the actual normalized recipient in delivery tracking', async () => {
    const { client, writes } = createAdminClientStub({
      workspace_users: { data: { email: 'New@Example.com ' }, error: null },
    });
    await processPeriodicReportAutomation(client as never, 'worker');
    expect(
      writesFor(writes, 'user_report_email_queue')[0]?.payload.recipient_email
    ).toBe('new@example.com');
  });

  it('blocks rejected reports and retries read failures without sending', async () => {
    const rejected = createAdminClientStub({
      external_user_monthly_reports: {
        data: { ...APPROVED_REPORT, report_approval_status: 'REJECTED' },
        error: null,
      },
    });
    await processPeriodicReportAutomation(rejected.client as never, 'worker');
    const failed = createAdminClientStub({
      workspace_users: { data: null, error: new Error('read failed') },
    });
    await processPeriodicReportAutomation(failed.client as never, 'worker');
    expect(send).not.toHaveBeenCalled();
    expect(
      writesFor(failed.writes, 'user_report_email_queue')[0]?.payload.status
    ).toBe('failed');
  });

  it('keeps a test delivery out of the report delivery history', async () => {
    const { client, writes } = createAdminClientStub();
    QUEUE_ROW.delivery_kind = 'test';

    try {
      await processPeriodicReportAutomation(client as never, 'worker-1');

      expect(send).toHaveBeenCalledOnce();
      const reportUpdate = writesFor(
        writes,
        'external_user_monthly_reports'
      ).at(-1)?.payload;
      expect(reportUpdate).toMatchObject({ delivery_status: 'draft' });
      expect(reportUpdate).not.toHaveProperty('delivered_at');
    } finally {
      QUEUE_ROW.delivery_kind = 'send';
    }
  });
});

describe('monthly AI generation recovery', () => {
  const run = {
    id: 'run-1',
    attempt_count: 2,
    cadence: 'monthly',
    generation_mode: 'ai',
    group_id: 'group-1',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    schedule_id: 'schedule-1',
    ws_id: 'ws-1',
  };
  function fixture(status: string, writeResults: Record<string, Result> = {}) {
    return createAdminClientStub(
      {
        user_report_schedules: {
          data: { created_by: 'teacher-1', manager_instruction: '' },
          error: null,
        },
        workspace_user_groups_users: {
          data: [{ user_id: 'user-1' }],
          error: null,
        },
        workspace_user_groups: { data: { name: 'Class' }, error: null },
        workspace_users: {
          data: [
            {
              id: 'user-1',
              display_name: 'Learner',
              full_name: null,
              note: null,
            },
          ],
          error: null,
        },
        external_user_monthly_reports: {
          data: { id: 'report-1', generation_status: status },
          error: null,
        },
      },
      [run],
      writeResults
    );
  }
  beforeEach(() => {
    generateNarrative.mockReset();
    generateNarrative.mockResolvedValue({
      content: 'Progress',
      feedback: 'Practice',
      title: 'Monthly',
    });
    reconcilePeriodicReportSchedules.mockResolvedValue({
      createdRuns: 0,
      dueSchedules: 0,
    });
  });
  it.each(['failed', 'generating'])(
    'resumes a %s report without creating a duplicate',
    async (status) => {
      const { client, writes } = fixture(status);
      generateNarrative.mockImplementation(async () => {
        expect(
          writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
        ).toMatchObject({
          generation_status: 'generating',
          updated_at: expect.any(String),
        });
        return { content: 'Progress', feedback: 'Practice', title: 'Monthly' };
      });
      await processPeriodicReportAutomation(client as never, 'worker');
      expect(generateNarrative).toHaveBeenCalledOnce();
      expect(
        writesFor(writes, 'external_user_monthly_reports').some(
          (write) => write.op === 'insert'
        )
      ).toBe(false);
      expect(
        writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
      ).toMatchObject({
        generation_status: 'ready',
        report_approval_status: 'PENDING',
      });
    }
  );
  it('marks generation failed and retains the automation retry', async () => {
    generateNarrative.mockRejectedValue(new Error('Provider unavailable'));
    const { client, writes } = fixture('generating');
    await processPeriodicReportAutomation(client as never, 'worker');
    expect(
      writesFor(writes, 'external_user_monthly_reports').at(-1)?.payload
        .generation_status
    ).toBe('failed');
    expect(
      writesFor(writes, 'user_report_automation_runs').at(-1)?.payload
    ).toMatchObject({ status: 'failed', last_error: 'Provider unavailable' });
  });
  it('does not generate when another writer wins the retry claim', async () => {
    const { client, writes } = fixture('failed', {
      external_user_monthly_reports: { data: null, error: null },
    });
    await processPeriodicReportAutomation(client as never, 'worker');
    expect(generateNarrative).not.toHaveBeenCalled();
    expect(writesFor(writes, 'external_user_monthly_reports')).toHaveLength(1);
  });
  it('does not overwrite a report already generated', async () => {
    const { client } = fixture('ready');
    await processPeriodicReportAutomation(client as never, 'worker');
    expect(generateNarrative).not.toHaveBeenCalled();
  });
});
