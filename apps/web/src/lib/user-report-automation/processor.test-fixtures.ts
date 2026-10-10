export type Result = { data: unknown; error: unknown };
interface Write {
  op: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  table: string;
}

export const QUEUE_ROW = {
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

export const APPROVED_REPORT = {
  user_id: 'user-1',
  content: 'Steady progress this month.',
  feedback: 'Keep practising past papers.',
  id: 'report-1',
  report_approval_status: 'APPROVED',
  title: 'Monthly report · Mai',
  review_revision: 1,
};

export function createAdminClientStub(
  overrides: Record<string, Result> = {},
  runs: unknown[] = [],
  writeResults: Record<string, Result> = {},
  replyRpc?: (name: string, args: Record<string, unknown>) => Result
) {
  const writes: Write[] = [];
  const rpcCalls: string[] = [];
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

  let emailClaimed = false;
  const privateSchema = {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name);
      if (name.includes('report_email_reply'))
        return Promise.resolve(
          replyRpc?.(name, args) ?? reads[name] ?? { data: false, error: null }
        );
      if (name === 'periodic_report_delivery_contract_ready')
        return Promise.resolve({ data: true, error: null });
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
      if (name === 'claim_periodic_report_emails') {
        const data = emailClaimed || runs.length ? [] : [{ ...QUEUE_ROW }];
        emailClaimed = true;
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({ data: runs, error: null });
    },
  };

  return {
    client: {
      from: (table: string) => makeBuilder(table),
      schema: () => privateSchema,
    },
    writes,
    rpcCalls,
  };
}

export function writesFor(writes: Write[], table: string) {
  return writes.filter((write) => write.table === table);
}
