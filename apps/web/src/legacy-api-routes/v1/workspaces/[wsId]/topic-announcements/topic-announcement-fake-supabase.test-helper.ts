import { vi } from 'vitest';

type Row = Record<string, any>;

function readPath(row: Row, path: string) {
  return path
    .split('.')
    .reduce<any>((value, key) => (value == null ? value : value[key]), row);
}

/** Splits a PostgREST logic-tree body on top-level commas. */
function splitTopLevel(body: string) {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      current += char;
      if (char === '\\') {
        current += body[index + 1] ?? '';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }
    if (char === '"') quoted = true;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (quoted || depth !== 0) throw new Error(`Malformed filter: ${body}`);
  parts.push(current);
  return parts;
}

function unquote(value: string) {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"') || value.length < 2) {
    throw new Error(`Malformed quoted value: ${value}`);
  }
  return value.slice(1, -1).replace(/\\(.)/gu, '$1');
}

/**
 * Evaluates the PostgREST logic-tree subset the topic routes emit:
 * `and(...)`, `or(...)`, `col.eq|neq|is|in|ilike.value`, quoted values.
 * Unknown syntax throws, so a malformed filter fails the test.
 */
export function compilePostgrestFilter(
  body: string,
  combine: 'and' | 'or' = 'or'
): (row: Row) => boolean {
  const terms = splitTopLevel(body).map((term) => {
    const logic = term.match(/^(and|or)\((.*)\)$/su);
    if (logic)
      return compilePostgrestFilter(logic[2]!, logic[1] as 'and' | 'or');
    const match = term.match(/^([a-z_]+)\.(eq|neq|is|in|ilike)\.(.*)$/su);
    if (!match) throw new Error(`Unsupported filter term: ${term}`);
    const [, column, operator, raw] = match as unknown as [
      string,
      string,
      string,
      string,
    ];
    if (operator === 'is') {
      if (raw !== 'null') throw new Error(`Unsupported is value: ${raw}`);
      return (row: Row) => row[column] == null;
    }
    if (operator === 'in') {
      const list = raw.match(/^\((.*)\)$/su);
      if (!list) throw new Error(`Malformed in list: ${raw}`);
      const values = splitTopLevel(list[1]!).map(unquote);
      return (row: Row) => values.includes(String(row[column]));
    }
    const value = unquote(raw);
    if (operator === 'eq') return (row: Row) => String(row[column]) === value;
    if (operator === 'neq') return (row: Row) => String(row[column]) !== value;
    const pattern = new RegExp(
      `^${value
        .split('')
        .map((char) =>
          char === '%'
            ? '.*'
            : char === '_'
              ? '.'
              : char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
        )
        .join('')}$`,
      'isu'
    );
    return (row: Row) =>
      row[column] != null && pattern.test(String(row[column]));
  });
  return (row) =>
    combine === 'and'
      ? terms.every((term) => term(row))
      : terms.some((term) => term(row));
}

/**
 * Minimal in-memory Supabase stand-in for topic announcement route tests.
 * Supports the filter/mutation subset those routes use. `or()` filters are
 * recorded (with the operation) and evaluated.
 */
export function createFakeSupabase(tables: Record<string, Row[]>) {
  const orFilters: { filter: string; mode: string; table: string }[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));

  const client: any = {
    orFilters,
    rpc,
    schema: () => client,
    tables,
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let mode: 'delete' | 'insert' | 'select' | 'update' = 'select';
      let patch: Row = {};
      let inserted: Row[] = [];
      const rows = () => {
        tables[table] ??= [];
        return tables[table];
      };
      const matching = () =>
        rows().filter((row) => filters.every((filter) => filter(row)));
      const run = () => {
        if (mode === 'update') {
          const matched = matching();
          for (const row of matched) Object.assign(row, patch);
          return matched;
        }
        if (mode === 'insert') {
          rows().push(...inserted);
          return inserted;
        }
        if (mode === 'delete') {
          const matched = matching();
          tables[table] = rows().filter((row) => !matched.includes(row));
          return matched;
        }
        return matching();
      };

      const chain: any = {
        delete: () => {
          mode = 'delete';
          return chain;
        },
        eq: (key: string, value: unknown) => {
          filters.push((row) => readPath(row, key) === value);
          return chain;
        },
        gte: (key: string, value: string) => {
          filters.push((row) => String(readPath(row, key)) >= value);
          return chain;
        },
        is: (key: string, value: null) => {
          filters.push((row) => (readPath(row, key) ?? null) === value);
          return chain;
        },
        lt: (key: string, value: string) => {
          filters.push((row) => String(readPath(row, key)) < value);
          return chain;
        },
        lte: (key: string, value: string) => {
          filters.push((row) => String(readPath(row, key)) <= value);
          return chain;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(readPath(row, key)));
          return chain;
        },
        insert: (value: Row | Row[]) => {
          mode = 'insert';
          inserted = (Array.isArray(value) ? value : [value]).map((row) => ({
            id: crypto.randomUUID(),
            ...row,
          }));
          return chain;
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        neq: (key: string, value: unknown) => {
          filters.push((row) => readPath(row, key) !== value);
          return chain;
        },
        or: (filter: string) => {
          orFilters.push({ filter, mode, table });
          filters.push(compilePostgrestFilter(filter));
          return chain;
        },
        order: () => chain,
        range: async () => {
          const data = run();
          return { count: data.length, data, error: null };
        },
        select: () => chain,
        single: async () => ({ data: run()[0] ?? null, error: null }),
        // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable PostgREST builder.
        then: (resolve: (value: unknown) => unknown, reject: () => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve, reject),
        update: (value: Row) => {
          mode = 'update';
          patch = value;
          return chain;
        },
      };
      return chain;
    },
  };
  return client;
}

export const WS_ID = '00000000-0000-4000-8000-000000000001';
export const OTHER_WS_ID = '00000000-0000-4000-8000-000000000002';
export const TEACHER_PLATFORM_ID = '00000000-0000-4000-8000-0000000000a1';
export const TEACHER_WU = '00000000-0000-4000-8000-0000000000b1';
export const OTHER_TEACHER_WU = '00000000-0000-4000-8000-0000000000b2';
export const FOREIGN_WU = '00000000-0000-4000-8000-0000000000b3';
export const TAUGHT_GROUP = '00000000-0000-4000-8000-0000000000c1';
export const OTHER_GROUP = '00000000-0000-4000-8000-0000000000c2';
export const STUDENT_GROUP = '00000000-0000-4000-8000-0000000000c3';
export const CONTACT_ID = '00000000-0000-4000-8000-0000000000d1';
export const OWN_TOPIC = '00000000-0000-4000-8000-0000000000e1';
export const GROUP_TOPIC = '00000000-0000-4000-8000-0000000000e2';
export const OTHER_TOPIC = '00000000-0000-4000-8000-0000000000e3';
export const STUDENT_TOPIC = '00000000-0000-4000-8000-0000000000e4';
export const FOREIGN_TOPIC = '00000000-0000-4000-8000-0000000000e5';
export const CLASS_TOPIC = '00000000-0000-4000-8000-0000000000e6';

function topic(id: string, overrides: Row = {}): Row {
  return {
    group_id: null,
    id,
    session_date: '2026-11-05',
    start_time: '18:30:00',
    status: 'draft',
    teacher_workspace_user_id: null,
    title: 'Session',
    topic: 'Existing topic',
    ws_id: WS_ID,
    ...overrides,
  };
}

/** Workspace fixture with one teacher, their classes and four topics. */
export function createTopicWorkspaceFixture() {
  return createFakeSupabase({
    topic_announcement_attachments: [],
    topic_announcement_contacts: [
      { archived: false, email: 'g@example.com', id: CONTACT_ID, ws_id: WS_ID },
    ],
    topic_announcement_recipients: [],
    topic_announcements: [
      topic(OWN_TOPIC, { teacher_workspace_user_id: TEACHER_WU }),
      topic(GROUP_TOPIC, {
        group_id: TAUGHT_GROUP,
        teacher_workspace_user_id: OTHER_TEACHER_WU,
      }),
      topic(OTHER_TOPIC, {
        group_id: OTHER_GROUP,
        teacher_workspace_user_id: OTHER_TEACHER_WU,
      }),
      topic(STUDENT_TOPIC, { group_id: STUDENT_GROUP }),
      topic(CLASS_TOPIC, { group_id: TAUGHT_GROUP }),
      topic(FOREIGN_TOPIC, {
        teacher_workspace_user_id: TEACHER_WU,
        ws_id: OTHER_WS_ID,
      }),
    ],
    workspace_user_groups: [
      { id: TAUGHT_GROUP, ws_id: WS_ID },
      { id: OTHER_GROUP, ws_id: WS_ID },
      { id: STUDENT_GROUP, ws_id: WS_ID },
    ],
    workspace_user_groups_users: [
      {
        group_id: TAUGHT_GROUP,
        role: 'TEACHER',
        user_id: TEACHER_WU,
        workspace_user_groups: { ws_id: WS_ID },
      },
      {
        group_id: STUDENT_GROUP,
        role: 'STUDENT',
        user_id: TEACHER_WU,
        workspace_user_groups: { ws_id: WS_ID },
      },
    ],
    workspace_user_linked_users: [
      {
        platform_user_id: TEACHER_PLATFORM_ID,
        virtual_user_id: TEACHER_WU,
        ws_id: WS_ID,
      },
    ],
    workspace_users: [
      { id: TEACHER_WU, ws_id: WS_ID },
      { id: OTHER_TEACHER_WU, ws_id: WS_ID },
      { id: FOREIGN_WU, ws_id: OTHER_WS_ID },
    ],
    workspaces: [{ id: WS_ID, personal: false, timezone: 'Asia/Ho_Chi_Minh' }],
  });
}
