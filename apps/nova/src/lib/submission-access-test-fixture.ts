type Row = Record<string, unknown>;

export const participantRole = {
  allow_challenge_management: false,
  allow_manage_all_challenges: false,
  allow_role_management: false,
  enabled: true,
};

export const managerRole = {
  ...participantRole,
  allow_manage_all_challenges: true,
};

export function submissionAccessFixture() {
  const tables: Record<string, Row[]> = {
    nova_challenge_criteria: [
      { id: 'criterion-1', challenge_id: 'challenge-1' },
      { id: 'criterion-other', challenge_id: 'challenge-2' },
    ],
    nova_challenge_manager_emails: [],
    nova_problem_test_cases: [
      { id: 'test-case-1', problem_id: 'problem-1' },
      { id: 'test-case-other', problem_id: 'problem-2' },
    ],
    nova_problems: [
      { id: 'problem-1', challenge_id: 'challenge-1' },
      { id: 'problem-2', challenge_id: 'challenge-2' },
    ],
    nova_submission_criteria: [],
    nova_submission_test_cases: [],
    nova_submissions: [
      {
        id: 'submission-1',
        problem_id: 'problem-1',
        prompt: 'original',
        session_id: 'session-1',
        user_id: 'user-1',
      },
    ],
  };
  const writes: Array<{
    filters: Array<[string, unknown]>;
    operation: 'delete' | 'update' | 'upsert';
    payload?: unknown;
    table: string;
  }> = [];

  const client = {
    schema: () => client,
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const lists: Array<[string, unknown[]]> = [];
      let columns: string[] | null = null;
      let write: (typeof writes)[number] | null = null;
      const rows = () =>
        (tables[table] ?? [])
          .filter(
            (row) =>
              filters.every(([column, value]) => row[column] === value) &&
              lists.every(([column, values]) => values.includes(row[column]))
          )
          .map((row) =>
            columns
              ? Object.fromEntries(
                  columns.map((column) => [column, row[column]])
                )
              : row
          );
      const one = () => {
        const [row] = write?.payload ? [write.payload as Row] : rows();
        return row
          ? { data: row, error: null }
          : { data: null, error: { code: 'PGRST116' } };
      };
      const startWrite = (
        operation: (typeof writes)[number]['operation'],
        payload?: unknown
      ) => {
        write = { filters, operation, payload, table };
        writes.push(write);
        return builder;
      };
      const builder = {
        delete: () => startWrite('delete'),
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          lists.push([column, values]);
          return builder;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        // Explicit column lists are projected so tests can assert which
        // fields leave the server; `*` and embedded selects return full rows.
        select: (projection?: string) => {
          if (projection && !projection.includes('*')) {
            columns = projection.split(',').map((column) => column.trim());
          }
          return builder;
        },
        single: async () => one(),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: write ? null : rows(), error: null }).then(
            resolve
          ),
        update: (payload: unknown) => startWrite('update', payload),
        upsert: (payload: unknown) => startWrite('upsert', payload),
      };
      return builder;
    },
  };

  return { client, tables, writes };
}

export const submissionParams = {
  params: Promise.resolve({ submissionId: 'submission-1' }),
};

export function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`https://nova.test${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    method,
  });
}
