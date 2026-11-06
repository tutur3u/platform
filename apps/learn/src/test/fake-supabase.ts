type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

interface FakeAuthUser {
  email: string | null;
  email_confirmed_at: string | null;
}

interface FakeOptions {
  /** Column defaults applied on insert, like the table definitions. */
  defaults?: Record<string, Row>;
  authUsers?: Record<string, FakeAuthUser>;
  /** Reject rows that would break a unique index, like Postgres (23505). */
  unique?: Record<string, (others: Row[], candidate: Row) => boolean>;
}

/**
 * Minimal in-memory stand-in for the Supabase query builder. It applies
 * filters for real, so conditional updates (`.eq('status', 'pending')`)
 * behave like the database instead of returning canned rows.
 */
export function createFakeSupabase(
  tables: Record<string, Row[]>,
  { authUsers = {}, defaults = {}, unique = {} }: FakeOptions = {}
) {
  let sequence = 0;
  const tableRows = (table: string) => {
    tables[table] ??= [];
    return tables[table] as Row[];
  };
  const writes: { op: 'insert' | 'update'; table: string; values: Row }[] = [];

  function from(table: string) {
    const rows = tableRows(table);
    const filters: Predicate[] = [];
    let op: 'insert' | 'select' | 'update' = 'select';
    let values: Row = {};
    let order: { ascending: boolean; column: string } | null = null;
    let columns: string[] | null = null;

    const project = (row: Row) =>
      columns
        ? Object.fromEntries(columns.map((column) => [column, row[column]]))
        : row;

    const run = () => {
      const matching = rows.filter((row) => filters.every((f) => f(row)));

      if (op === 'insert') {
        const candidate = {
          created_at: new Date(Date.now() + sequence).toISOString(),
          id: `generated-${++sequence}`,
          ...defaults[table],
          ...values,
        };
        if (unique[table]?.(rows, candidate)) {
          return { data: null, error: { code: '23505', message: 'unique' } };
        }
        rows.push(candidate);
        writes.push({ op, table, values: candidate });
        return { data: [project(candidate)], error: null };
      }

      if (op === 'update') {
        for (const row of matching) {
          const others = rows.filter((other) => other !== row);
          if (unique[table]?.(others, { ...row, ...values })) {
            return { data: null, error: { code: '23505', message: 'unique' } };
          }
        }
        for (const row of matching) Object.assign(row, values);
        writes.push({ op, table, values });
        return {
          data: matching.map((row) => project({ ...row })),
          error: null,
        };
      }

      const result = matching.map((row) => project({ ...row }));
      if (order) {
        const { ascending, column } = order;
        result.sort((a, b) =>
          String(a[column]) < String(b[column]) === ascending ? -1 : 1
        );
      }
      return { data: result, error: null };
    };

    const single = (required: boolean) => {
      const { data, error } = run();
      if (error) return { data: null, error };
      const first = data?.[0] ?? null;
      return {
        data: first,
        error:
          required && !first ? { code: 'PGRST116', message: 'none' } : null,
      };
    };

    const query: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      gt: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) > String(value));
        return query;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => String(row[column]) >= String(value));
        return query;
      },
      in: (column: string, list: unknown[]) => {
        filters.push((row) => list.includes(row[column]));
        return query;
      },
      insert: (payload: Row) => {
        op = 'insert';
        values = payload;
        return query;
      },
      limit: () => query,
      maybeSingle: async () => single(false),
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return query;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        order = { ascending: options?.ascending ?? true, column };
        return query;
      },
      select: (selected?: string) => {
        // Only plain column lists are projected; `*` and relations pass through.
        columns =
          selected && selected !== '*' && !selected.includes('(')
            ? selected.split(',').map((column) => column.trim())
            : null;
        return query;
      },
      single: async () => single(true),
      update: (payload: Row) => {
        op = 'update';
        values = payload;
        return query;
      },
    };
    // Thenable so `await query` runs it, like the real builder.
    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(run()).then(resolve, reject),
    });
    return query;
  }

  return {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: authUsers[id] ? { id, ...authUsers[id] } : null },
          error: null,
        }),
      },
    },
    from,
    rows: tableRows,
    writes,
  };
}

/** Mirrors `tulearn_parent_student_links_active_key`. */
export const activeLinkUnique = (others: Row[], candidate: Row) =>
  candidate.status === 'active' &&
  others.some(
    (row) =>
      row.status === 'active' &&
      row.ws_id === candidate.ws_id &&
      row.parent_user_id === candidate.parent_user_id &&
      row.student_workspace_user_id === candidate.student_workspace_user_id
  );
