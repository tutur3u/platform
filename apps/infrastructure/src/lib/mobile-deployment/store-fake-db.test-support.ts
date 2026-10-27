// In-memory stand-in for the private-schema Supabase client used by the
// mobile deployment store tests. It implements only the query surface that
// store.ts uses and keeps every row so tests can assert on persisted state.
type Row = Record<string, unknown>;
type Op = 'delete' | 'insert' | 'select' | 'update' | 'upsert';
type Filter = (row: Row) => boolean;

const TABLES = [
  'mobile_deployment_audit_events',
  'mobile_deployment_bundle_fetches',
  'mobile_deployment_ci_tokens',
  'mobile_deployment_environments',
  'mobile_deployment_file_artifacts',
  'mobile_deployment_secret_values',
  'mobile_deployment_versions',
] as const;

export interface FakeVaultDb {
  failOn: (op: Op, table: string, message: string) => void;
  schema: (name: string) => { from: (table: string) => unknown };
  tables: Record<(typeof TABLES)[number], Row[]>;
}

export function createFakeVaultDb(seed: Partial<FakeVaultDb['tables']> = {}) {
  const tables = Object.fromEntries(
    TABLES.map((name) => [name, structuredClone(seed[name] ?? [])])
  ) as FakeVaultDb['tables'];
  const failures = new Map<string, string>();
  let sequence = 0;
  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  function from(table: string) {
    const rows = tables[table as keyof typeof tables];
    if (!rows) throw new Error(`Unexpected table ${table}`);

    let op: Op = 'select';
    let payload: Row | Row[] = [];
    let conflictColumns: string[] = [];
    let single: 'maybe' | 'one' | null = null;
    let limit = Number.POSITIVE_INFINITY;
    let order: { ascending: boolean; column: string } | null = null;
    const filters: Filter[] = [];

    const execute = () => {
      const failure = failures.get(`${op}:${table}`);
      if (failure) return { data: null, error: { message: failure } };

      const matches = () =>
        rows.filter((row) => filters.every((check) => check(row)));
      let data: Row[];
      if (op === 'insert') {
        data = (Array.isArray(payload) ? payload : [payload]).map((entry) => {
          const id = nextSequence();
          const row = {
            created_at: new Date(Date.now() + id).toISOString(),
            id: `${table}-${id}`,
            ...entry,
          };
          rows.push(row);
          return row;
        });
      } else if (op === 'upsert') {
        const entry = payload as Row;
        const existing = rows.find((row) =>
          conflictColumns.every((column) => row[column] === entry[column])
        );
        if (existing) Object.assign(existing, entry);
        else rows.push({ id: `${table}-${nextSequence()}`, ...entry });
        data = [existing ?? rows.at(-1)!];
      } else if (op === 'update') {
        data = matches();
        for (const row of data) Object.assign(row, payload);
      } else if (op === 'delete') {
        data = matches();
        for (const row of data) rows.splice(rows.indexOf(row), 1);
      } else {
        data = matches();
        if (order) {
          const { ascending, column } = order;
          data = [...data].sort((a, b) => {
            const left = String(a[column] ?? '');
            const right = String(b[column] ?? '');
            const comparison = left < right ? -1 : left > right ? 1 : 0;
            return ascending ? comparison : -comparison;
          });
        }
        data = data.slice(0, limit);
      }

      if (single === 'maybe') return { data: data[0] ?? null, error: null };
      if (single === 'one') {
        return data[0]
          ? { data: data[0], error: null }
          : { data: null, error: { message: 'No rows' } };
      }
      return { data, error: null };
    };

    const builder = {
      delete: () => {
        op = 'delete';
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      gt: (column: string, value: string) => {
        filters.push((row) => String(row[column] ?? '') > value);
        return builder;
      },
      insert: (value: Row | Row[]) => {
        op = 'insert';
        payload = value;
        return builder;
      },
      is: (column: string, value: null) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      maybeSingle: () => {
        single = 'maybe';
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        order = { ascending: options?.ascending ?? true, column };
        return builder;
      },
      select: () => builder,
      single: () => {
        single = 'one';
        return builder;
      },
      // Supabase query builders are awaited directly, so this is intentional.
      // biome-ignore lint/suspicious/noThenProperty: mimics the real client.
      then: (
        resolve: (value: ReturnType<typeof execute>) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve().then(execute).then(resolve, reject),
      update: (value: Row) => {
        op = 'update';
        payload = value;
        return builder;
      },
      upsert: (value: Row, options?: { onConflict?: string }) => {
        op = 'upsert';
        payload = value;
        conflictColumns = (options?.onConflict ?? 'id').split(',');
        return builder;
      },
    };
    return builder;
  }

  return {
    failOn: (op, table, message) =>
      void failures.set(`${op}:${table}`, message),
    schema: (name: string) => {
      if (name !== 'private') throw new Error(`Unexpected schema ${name}`);
      return { from };
    },
    tables,
  } satisfies FakeVaultDb as FakeVaultDb;
}
