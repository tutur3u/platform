type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
export function recipientWorkerFixture(
  options: {
    subjectId?: string;
    profileWorkspace?: string;
    completion?: 'error' | 'lost';
    auditFailure?: boolean;
  } = {}
) {
  const queue: Row = {
    id: 'queue-a',
    report_id: 'report-a',
    user_id: 'subject-a',
    ws_id: 'workspace-a',
    recipient_email: 'stale@example.com',
    delivery_kind: 'send',
    attempt_count: 1,
    locked_by: 'worker-a',
    locked_at: new Date().toISOString(),
    status: 'queued',
  };
  const report: Row = {
    id: 'report-a',
    user_id: options.subjectId ?? 'subject-a',
    title: 'Synthetic monthly report',
    content: 'Synthetic progress',
    feedback: '',
    report_approval_status: 'APPROVED',
    delivery_status: 'queued',
  };
  const profiles: Row[] = [
    {
      id: 'subject-b',
      ws_id: 'workspace-b',
      email: 'other-workspace@example.com',
    },
    {
      id: 'subject-a',
      ws_id: options.profileWorkspace ?? 'workspace-a',
      email: 'current@example.com',
    },
    {
      id: 'replacement-a',
      ws_id: 'workspace-a',
      email: 'replacement@example.com',
    },
  ];
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const attempts: Row[] = [];
  const completions: Row[] = [];
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    let write: Row | undefined;
    const record = { table, filters };
    calls.push(record);
    const execute = (): Result => {
      if (write) {
        if (table === 'sent_emails' && options.auditFailure)
          return {
            data: null,
            error: { message: 'Synthetic audit unavailable' },
          };
        if (table === 'user_report_email_attempts') attempts.push(write);
        return { data: null, error: null };
      }
      const rows =
        table === 'workspace_users'
          ? profiles
          : table === 'external_user_monthly_reports'
            ? [report]
            : table === 'user_report_email_queue'
              ? [queue]
              : table === 'workspaces'
                ? [{ id: 'workspace-a', creator_id: 'actor-a' }]
                : table === 'workspace_email_credentials'
                  ? [
                      {
                        ws_id: 'workspace-a',
                        source_email: 'sender@example.com',
                        source_name: 'Synthetic sender',
                      },
                    ]
                  : [];
      const row = rows.find((candidate) =>
        filters.every(([key, value]) => candidate[key] === value)
      );
      return {
        data: row ?? null,
        error: row ? null : { message: 'Synthetic row not found' },
      };
    };
    const builder: Record<string, unknown> = new Proxy(Promise.resolve(), {
      get(_target, property) {
        if (['then', 'catch', 'finally'].includes(String(property))) {
          const promise = Promise.resolve().then(execute);
          const member = Reflect.get(promise, property, promise);
          return typeof member === 'function' ? member.bind(promise) : member;
        }
        if (property === 'single' || property === 'maybeSingle')
          return () => Promise.resolve().then(execute);
        return (...args: unknown[]) => {
          if (property === 'eq') filters.push([String(args[0]), args[1]]);
          if (property === 'insert') write = args[0] as Row;
          return builder;
        };
      },
    }) as unknown as Record<string, unknown>;
    return builder;
  };
  const db = {
    from: query,
    rpc: async (name: string, args: Row) => {
      if (name === 'claim_periodic_report_runs')
        return { data: [], error: null };
      if (name === 'claim_periodic_report_emails') {
        if (queue.status !== 'queued') return { data: [], error: null };
        queue.status = 'processing';
        report.delivery_status = 'processing';
        return { data: [{ ...queue }], error: null };
      }
      if (name === 'finish_periodic_report_email') {
        if (args.p_queue_id === '00000000-0000-0000-0000-000000000000')
          return { data: false, error: null };
        completions.push(args);
        if (options.completion === 'error')
          return {
            data: null,
            error: { message: 'Synthetic completion unavailable' },
          };
        if (options.completion === 'lost') return { data: false, error: null };
        queue.status = args.p_status;
        queue.recipient_email = args.p_recipient_email;
        queue.provider_message_id = args.p_provider_message_id;
        queue.sent_at = args.p_sent_at;
        report.delivery_status = args.p_status;
        return { data: true, error: null };
      }
      throw new Error('Unexpected synthetic RPC');
    },
  };
  return {
    client: { from: query, schema: () => db },
    queue,
    report,
    profiles,
    calls,
    attempts,
    completions,
  };
}
