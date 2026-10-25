import { NextRequest } from 'next/server';

export type Row = Record<string, unknown>;
export type Db = Record<string, Row[]>;

// Keys and their verified context, as validateApiKey would return them.
export const API_KEYS = {
  ttr_key_a: {
    wsId: 'ws-a',
    keyId: 'key-a',
    roleId: 'role-a',
    permissions: ['ai_lab'],
  },
  ttr_key_a_no_ai_lab: {
    wsId: 'ws-a',
    keyId: 'key-a2',
    roleId: null,
    permissions: [],
  },
} as const;

export function validateFixtureApiKey(key: string) {
  return API_KEYS[key as keyof typeof API_KEYS] ?? null;
}

/** Minimal in-memory PostgREST builder that applies `.eq` filters. */
export function createFakeSupabase(db: Db) {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: Row | Row[] = {};
      let columns = '*';
      let withCount = false;
      let single = false;

      const project = (rows: Row[]) =>
        rows.map((row) =>
          columns === '*'
            ? { ...row }
            : Object.fromEntries(
                columns
                  .split(',')
                  .map((column) => column.trim())
                  .map((column) => [column, row[column]])
              )
        );

      const execute = () => {
        const rows = db[table] ?? [];

        if (op === 'insert') {
          const inserted = (Array.isArray(payload) ? payload : [payload]).map(
            (row, index) => ({ id: `${table}-new-${index}`, ...row })
          );
          db[table] = [...rows, ...inserted];
          const data = project(inserted);
          return { data: single ? data[0] : data, error: null };
        }

        const matched = rows.filter((row) =>
          filters.every(([column, value]) => row[column] === value)
        );

        if (op === 'update') {
          for (const row of matched) Object.assign(row, payload);
          return { data: null, error: null };
        }

        if (op === 'delete') {
          db[table] = rows.filter((row) => !matched.includes(row));
          return { data: null, error: null };
        }

        const data = project(matched);
        return {
          data: single ? (data[0] ?? null) : data,
          count: withCount ? matched.length : null,
          error: null,
        };
      };

      const query = {
        select: (selected = '*', options?: { count?: string }) => {
          columns = selected;
          withCount = Boolean(options?.count);
          return query;
        },
        insert: (data: Row | Row[]) => {
          op = 'insert';
          payload = data;
          return query;
        },
        upsert: (data: Row | Row[]) => query.insert(data),
        update: (data: Row) => {
          op = 'update';
          payload = data;
          return query;
        },
        delete: () => {
          op = 'delete';
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        order: () => query,
        range: () => query,
        limit: () => query,
        maybeSingle: () => {
          single = true;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: mimics the thenable PostgREST builder
        then: (
          resolve: (value: ReturnType<typeof execute>) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve().then(execute).then(resolve, reject),
      };

      return query;
    },
  };
}

/** Two workspaces, each with one dataset, row, column and cell. */
export function seedDb(): Db {
  return {
    workspace_datasets: [
      { id: 'ds-a', ws_id: 'ws-a', name: 'Dataset A', description: null },
      { id: 'ds-b', ws_id: 'ws-b', name: 'Dataset B', description: 'secret' },
    ],
    workspace_dataset_rows: [
      { id: 'row-a', dataset_id: 'ds-a' },
      { id: 'row-b', dataset_id: 'ds-b' },
    ],
    workspace_dataset_columns: [
      { id: 'col-a', dataset_id: 'ds-a', name: 'field-a' },
      { id: 'col-b', dataset_id: 'ds-b', name: 'field-b' },
    ],
    workspace_dataset_cells: [
      {
        id: 'cell-a',
        dataset_id: 'ds-a',
        row_id: 'row-a',
        column_id: 'col-a',
        data: 'a',
      },
      {
        id: 'cell-b',
        dataset_id: 'ds-b',
        row_id: 'row-b',
        column_id: 'col-b',
        data: 'b-secret',
      },
    ],
    workspace_dataset_row_cells: [
      { dataset_id: 'ds-a', row_id: 'row-a', cells: { value: 'a' } },
      { dataset_id: 'ds-b', row_id: 'row-b', cells: { value: 'b-secret' } },
    ],
  };
}

export function request(
  url: string,
  init?: { method?: string; body?: unknown }
) {
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const datasetsUrl = (wsId: string) =>
  `http://localhost/api/v1/workspaces/${wsId}/datasets`;

export const datasetUrl = (wsId: string, datasetId: string) =>
  `${datasetsUrl(wsId)}/${datasetId}`;
