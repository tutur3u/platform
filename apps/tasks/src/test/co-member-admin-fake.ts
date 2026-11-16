/**
 * In-memory admin client for co-member name tests (D246). Serves every table
 * from `tables`, honouring `eq`/`in` filters on columns the rows carry, so the
 * real `resolveCoMemberNames` guards run against it.
 */
export type FakeTables = Record<string, Record<string, unknown>[]>;

export function coMemberTables({
  wsId,
  hideEmail = false,
  members,
  emails,
}: {
  wsId: string;
  hideEmail?: boolean;
  members: Array<{ user_id: string; type: 'MEMBER' | 'GUEST' }>;
  emails: Array<{ user_id: string; email: string }>;
}): FakeTables {
  return {
    workspace_secrets: hideEmail
      ? [{ ws_id: wsId, name: 'HIDE_MEMBER_EMAIL', value: 'true' }]
      : [],
    workspace_members: members.map((member) => ({ ws_id: wsId, ...member })),
    user_private_details: emails,
  };
}

export function createFakeAdmin(tables: FakeTables) {
  const calls: Array<{ table: string; columns?: string }> = [];

  const query = (table: string, rows: Record<string, unknown>[]) => {
    const filtered = (
      predicate: (row: Record<string, unknown>) => boolean,
      column: string
    ) =>
      query(
        table,
        rows.some((row) => column in row) ? rows.filter(predicate) : rows
      );
    const result = () => ({ data: rows, error: null });
    const builder: Record<string, unknown> = {
      select: (columns?: string) => {
        calls.push({ table, columns });
        return builder;
      },
      eq: (column: string, value: unknown) =>
        filtered((row) => row[column] === value, column),
      in: (column: string, values: unknown[]) =>
        filtered((row) => values.includes(row[column]), column),
      is: () => builder,
      not: () => builder,
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      gte: () => builder,
      lte: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (
        resolve: (value: ReturnType<typeof result>) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  };

  return {
    calls,
    from: (table: string) => query(table, tables[table] ?? []),
  };
}
