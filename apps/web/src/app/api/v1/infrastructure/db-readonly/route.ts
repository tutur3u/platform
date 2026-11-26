import { createHash, randomUUID } from 'node:crypto';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { connection } from 'next/server';
import { z } from 'zod';
import { requireExternalControlPlaneAccess } from '@/lib/external-projects/root-access';

export const maxDuration = 15;
const QUERY_TIMEOUT_MS = 5_000;
const DB_DEFAULT_LIMIT = 100;
const DB_MAX_LIMIT = 500;
const MAX_COLUMNS = 32;
const MAX_FILTERS = 12;
const MAX_ORDER_TERMS = 4;
const SIMPLE_IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/iu;
const toSet = (s: string) => new Set(s.trim().split(/\s+/u));

const ALLOWLIST = toSet(
  'task_lists task_projects tasks workspace_boards workspace_settings workspace_task_labels workspaces'
);
const BAD_SCHEMAS = toSet(
  'auth extensions private realtime storage supabase_functions vault'
);
const BAD_KW = toSet(
  'ALTER ANALYSE ANALYZE CALL CHECKPOINT CLUSTER COPY CREATE CURRENT_SETTING CURSOR_TO_XML DATABASE_TO_XML DBLINK DBLINK_CONNECT DBLINK_EXEC DEALLOCATE DELETE DISCARD DO DROP EXECUTE EXPLAIN FOR GRANT IMPORT INSERT INTO JOIN LATERAL LISTEN LO_CREATE LO_EXPORT LO_FROM_BYTEA LO_IMPORT LO_PUT LO_UNLINK LOCK MERGE NOTIFY PG_CANCEL_BACKEND PG_LS_DIR PG_LS_LOGDIR PG_LS_TMPDIR PG_LS_WALDIR PG_READ_BINARY_FILE PG_READ_FILE PG_RELOAD_CONF PG_ROTATE_LOGFILE PG_STAT_FILE PG_TERMINATE_BACKEND PREPARE QUERY_TO_XML REFRESH REINDEX RESET REVOKE SET SET_CONFIG SHOW TABLE_TO_XML TRUNCATE UNION UNLISTEN UPDATE UPSERT VACUUM WITH'
);
const LEX_RE =
  /(\s+)|(--)|(\/\*)|([uU]&['"])|(\$(?:[A-Za-z_]\w*)?\$)|('(?:''|[^'])*')|("(?:""|[^"])+")|(<=|>=|<>|!=|[=<>.,;*()])|([A-Za-z_]\w*)|(-?[0-9]+(?:\.[0-9]+)?)|(['"])|(.)/uy;

const PayloadSchema = z
  .object({
    env: z.enum(['local', 'prod', 'sandbox', 'staging']).optional(),
    limit: z.number().int().min(1).max(DB_MAX_LIMIT).optional(),
    sql: z.string().trim().min(1).max(16_000),
  })
  .strict();

interface Tok {
  kind: 'ident' | 'number' | 'op' | 'string' | 'word';
  raw: string;
  value: string;
}

type FilterOp =
  | 'eq'
  | 'gt'
  | 'gte'
  | 'is_not_null'
  | 'is_null'
  | 'lt'
  | 'lte'
  | 'neq';

interface Filter {
  column: string;
  op: FilterOp;
  value: boolean | number | string | null;
}

interface OrderTerm {
  ascending: boolean;
  column: string;
}

type SqlCheck =
  | {
      columns: '*' | string[];
      filters: Filter[];
      limit: number;
      normalizedSql: string;
      ok: true;
      orderBy: OrderTerm[];
      table: string;
      tables: string[];
    }
  | { code: string; error: string; ok: false; status: 400 | 403 };

interface PostgrestSelectBuilder {
  abortSignal(signal: AbortSignal): PostgrestSelectBuilder;
  eq(column: string, value: unknown): PostgrestSelectBuilder;
  gt(column: string, value: unknown): PostgrestSelectBuilder;
  gte(column: string, value: unknown): PostgrestSelectBuilder;
  is(column: string, value: null): PostgrestSelectBuilder;
  limit(count: number): PostgrestSelectBuilder;
  lt(column: string, value: unknown): PostgrestSelectBuilder;
  lte(column: string, value: unknown): PostgrestSelectBuilder;
  neq(column: string, value: unknown): PostgrestSelectBuilder;
  not(column: string, operator: 'is', value: null): PostgrestSelectBuilder;
  order(
    column: string,
    options: { ascending: boolean }
  ): PostgrestSelectBuilder;
  then<TResult1 = { data: unknown; error: { code?: string } | null }>(
    onfulfilled?: (value: {
      data: unknown;
      error: { code?: string } | null;
    }) => TResult1 | PromiseLike<TResult1>
  ): PromiseLike<TResult1>;
}

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { headers: { 'Cache-Control': 'no-store' }, status });
const errReply = (status: number, code: string, error?: string) =>
  reply(status, error ? { code, error } : { code });
const sha256 = (v: string) =>
  createHash('sha256').update(v, 'utf8').digest('hex');
const bad = (
  code: string,
  error: string,
  status: 400 | 403 = 403
): SqlCheck => ({ code, error, ok: false, status });
const isW = (t: Tok | undefined, u: string) =>
  t?.kind === 'word' && t.value.toUpperCase() === u;
const isId = (t: Tok | undefined): t is Tok =>
  t !== undefined && (t.kind === 'word' || t.kind === 'ident');

function tokenize(sql: string): { error: SqlCheck } | { tokens: Tok[] } {
  if (sql.includes('\0'))
    return { error: bad('invalid_sql', 'NUL bytes forbidden.', 400) };
  const tokens: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    LEX_RE.lastIndex = i;
    const m = LEX_RE.exec(sql);
    if (!m) return { error: bad('invalid_sql', 'Invalid SQL syntax.', 400) };
    if (m[1]) {
      i = LEX_RE.lastIndex;
      continue;
    }
    if (m[2] || m[3])
      return { error: bad('forbidden_sql', 'SQL comments are forbidden.') };
    if (m[4] || m[5])
      return {
        error: bad(
          'forbidden_sql',
          'Dollar-quoted or U&-escaped SQL forbidden.'
        ),
      };
    if (m[11])
      return {
        error: bad('invalid_sql', 'Unterminated literal or identifier.', 400),
      };
    if (m[12])
      return { error: bad('forbidden_sql', 'Unsupported SQL syntax.') };
    const raw = m[0];
    const kind: Tok['kind'] = m[6]
      ? 'string'
      : m[7]
        ? 'ident'
        : m[8]
          ? 'op'
          : m[9]
            ? 'word'
            : 'number';
    const value = m[6]
      ? raw.slice(1, -1).replace(/''/gu, "'")
      : m[7]
        ? raw.slice(1, -1).replace(/""/gu, '"')
        : raw;
    tokens.push({ kind, raw, value });
    i = LEX_RE.lastIndex;
  }
  return { tokens };
}

function parseColumn(tok: Tok | undefined): string | null {
  if (!isId(tok) || !SIMPLE_IDENT_RE.test(tok.value)) return null;
  const lower = tok.value.toLowerCase();
  return BAD_KW.has(lower.toUpperCase()) ? null : lower;
}

function formatCanonicalSql(
  columns: '*' | string[],
  table: string,
  filters: Filter[],
  orderBy: OrderTerm[],
  limit: number
): string {
  const cols = columns === '*' ? '*' : columns.join(', ');
  const parts = [`SELECT ${cols} FROM public.${table}`];
  if (filters.length > 0) {
    const ops: Record<Exclude<FilterOp, 'is_not_null' | 'is_null'>, string> = {
      eq: '=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      neq: '!=',
    };
    const exprs = filters.map((f) => {
      if (f.op === 'is_null') return `${f.column} IS NULL`;
      if (f.op === 'is_not_null') return `${f.column} IS NOT NULL`;
      const lit =
        typeof f.value === 'string'
          ? `'${f.value.replace(/'/gu, "''")}'`
          : String(f.value);
      return `${f.column} ${ops[f.op]} ${lit}`;
    });
    parts.push(`WHERE ${exprs.join(' AND ')}`);
  }
  if (orderBy.length > 0) {
    parts.push(
      `ORDER BY ${orderBy.map((o) => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    );
  }
  parts.push(`LIMIT ${limit}`);
  return parts.join(' ');
}

function parseReadOnlyQuery(sql: string, reqLimit?: number): SqlCheck {
  const lexed = tokenize(sql);
  if ('error' in lexed) return lexed.error;
  const { tokens } = lexed;
  const semis = tokens.flatMap((t, idx) => (t.raw === ';' ? [idx] : []));
  if (
    semis.length > 1 ||
    (semis.length === 1 && semis[0] !== tokens.length - 1)
  )
    return bad('forbidden_sql', 'Multiple statements forbidden.');
  const clean = semis.length === 1 ? tokens.slice(0, -1) : tokens;
  if (!clean.length) return bad('invalid_sql', 'Empty SQL.', 400);

  for (let i = 0; i < clean.length; i += 1) {
    const t = clean[i]!;
    if (t.kind === 'string') continue;
    if (isId(t) && BAD_KW.has(t.value.toUpperCase()))
      return bad('forbidden_sql', `Forbidden "${t.value.toUpperCase()}".`);
    if (
      t.raw === '.' &&
      isId(clean[i - 1]) &&
      BAD_SCHEMAS.has(clean[i - 1]!.value.toLowerCase())
    )
      return bad(
        'forbidden_schema',
        `Schema "${clean[i - 1]!.value.toLowerCase()}" forbidden.`
      );
  }

  let idx = 0;
  if (!isW(clean[idx], 'SELECT'))
    return bad(
      'forbidden_sql',
      'Only simple single-table SELECT queries are allowed.'
    );
  idx += 1;

  let columns: '*' | string[];
  if (clean[idx]?.raw === '*') {
    columns = '*';
    idx += 1;
  } else {
    const list: string[] = [];
    while (idx < clean.length) {
      const col = parseColumn(clean[idx]);
      if (!col) return bad('forbidden_sql', 'Invalid column identifier.');
      list.push(col);
      idx += 1;
      if (list.length > MAX_COLUMNS)
        return bad('invalid_sql', `At most ${MAX_COLUMNS} columns.`, 400);
      if (clean[idx]?.raw === ',') {
        idx += 1;
        continue;
      }
      break;
    }
    if (!list.length)
      return bad('invalid_sql', 'SELECT requires a column list or *.', 400);
    columns = list;
  }

  if (!isW(clean[idx], 'FROM'))
    return bad('invalid_sql', 'Expected FROM clause.', 400);
  idx += 1;
  if (!isId(clean[idx]))
    return bad('invalid_sql', 'Expected table name after FROM.', 400);
  let schema: string | null = null;
  let table = clean[idx]!.value.toLowerCase();
  idx += 1;
  if (clean[idx]?.raw === '.') {
    schema = table;
    idx += 1;
    if (!isId(clean[idx]))
      return bad('invalid_sql', 'Expected table name after schema.', 400);
    table = clean[idx]!.value.toLowerCase();
    idx += 1;
    if (clean[idx]?.raw === '.')
      return bad('forbidden_schema', 'Cross-db ref forbidden.');
  }
  if (schema !== null) {
    if (BAD_SCHEMAS.has(schema))
      return bad('forbidden_schema', `Schema "${schema}" forbidden.`);
    if (schema !== 'public')
      return bad('table_not_allowlisted', `Schema "${schema}" blocked.`);
  }
  if (!ALLOWLIST.has(table))
    return bad('table_not_allowlisted', `Table "${table}" blocked.`);

  const filters: Filter[] = [];
  if (isW(clean[idx], 'WHERE')) {
    idx += 1;
    while (idx < clean.length) {
      if (filters.length >= MAX_FILTERS)
        return bad('invalid_sql', `At most ${MAX_FILTERS} filters.`, 400);
      const column = parseColumn(clean[idx]);
      if (!column) return bad('forbidden_sql', 'Invalid WHERE column.');
      idx += 1;
      if (isW(clean[idx], 'IS')) {
        idx += 1;
        let negated = false;
        if (isW(clean[idx], 'NOT')) {
          negated = true;
          idx += 1;
        }
        if (!isW(clean[idx], 'NULL'))
          return bad('invalid_sql', 'Expected NULL after IS [NOT].', 400);
        idx += 1;
        filters.push({
          column,
          op: negated ? 'is_not_null' : 'is_null',
          value: null,
        });
      } else {
        const opMap: Record<string, FilterOp> = {
          '!=': 'neq',
          '<': 'lt',
          '<=': 'lte',
          '<>': 'neq',
          '=': 'eq',
          '>': 'gt',
          '>=': 'gte',
        };
        const op =
          clean[idx]?.kind === 'op' ? opMap[clean[idx]!.raw] : undefined;
        if (!op) return bad('forbidden_sql', 'Unsupported WHERE operator.');
        idx += 1;
        const lit = clean[idx];
        let val: boolean | number | string;
        if (lit?.kind === 'string') val = lit.value;
        else if (lit?.kind === 'number' && Number.isFinite(Number(lit.value)))
          val = Number(lit.value);
        else if (isW(lit, 'TRUE')) val = true;
        else if (isW(lit, 'FALSE')) val = false;
        else
          return bad(
            'invalid_sql',
            'WHERE requires scalar literal values.',
            400
          );
        filters.push({ column, op, value: val });
        idx += 1;
      }
      if (isW(clean[idx], 'AND')) {
        idx += 1;
        continue;
      }
      break;
    }
  }

  const orderBy: OrderTerm[] = [];
  if (isW(clean[idx], 'ORDER')) {
    idx += 1;
    if (!isW(clean[idx], 'BY'))
      return bad('invalid_sql', 'Expected BY after ORDER.', 400);
    idx += 1;
    while (idx < clean.length) {
      if (orderBy.length >= MAX_ORDER_TERMS)
        return bad(
          'invalid_sql',
          `At most ${MAX_ORDER_TERMS} ORDER BY cols.`,
          400
        );
      const column = parseColumn(clean[idx]);
      if (!column) return bad('forbidden_sql', 'Invalid ORDER BY column.');
      idx += 1;
      let ascending = true;
      if (isW(clean[idx], 'ASC')) idx += 1;
      else if (isW(clean[idx], 'DESC')) {
        ascending = false;
        idx += 1;
      }
      orderBy.push({ ascending, column });
      if (clean[idx]?.raw === ',') {
        idx += 1;
        continue;
      }
      break;
    }
  }

  const maxCap = Math.min(reqLimit ?? DB_MAX_LIMIT, DB_MAX_LIMIT);
  let limit = Math.min(reqLimit ?? DB_DEFAULT_LIMIT, maxCap);
  if (isW(clean[idx], 'LIMIT')) {
    idx += 1;
    const tok = clean[idx];
    const n =
      tok?.kind === 'number' && /^\d+$/u.test(tok.value)
        ? Number(tok.value)
        : Number.NaN;
    if (!Number.isInteger(n) || n < 1 || n > maxCap)
      return bad('limit_exceeded', `Limit must be 1..${maxCap}.`, 400);
    limit = n;
    idx += 1;
  }

  if (idx !== clean.length)
    return bad('forbidden_sql', 'Unexpected trailing SQL clause.');

  return {
    columns,
    filters,
    limit,
    normalizedSql: formatCanonicalSql(columns, table, filters, orderBy, limit),
    ok: true,
    orderBy,
    table,
    tables: [table],
  };
}

export async function POST(request: Request) {
  await connection();
  const startedAt = Date.now();
  const requestId =
    request.headers.get('x-ttr-request-id')?.trim() || randomUUID();

  let access: Awaited<ReturnType<typeof requireExternalControlPlaneAccess>>;
  try {
    access = await requireExternalControlPlaneAccess(request, 'apps');
  } catch {
    return errReply(503, 'db_readonly_unavailable', 'Auth unavailable.');
  }
  if (!access.ok) {
    const status = access.response.status;
    console.warn('[db_cli_readonly] unauthorized_request', {
      requestId,
      status,
    });
    return errReply(
      status,
      status === 401
        ? 'unauthorized'
        : status === 403
          ? 'forbidden'
          : 'db_readonly_unavailable'
    );
  }

  if (
    access.permissions?.membershipType !== 'MEMBER' ||
    !isExactTuturuuuDotComEmail(access.user.email)
  ) {
    console.warn('[db_cli_readonly] unauthorized_request', {
      requestId,
      status: 403,
    });
    return errReply(403, 'forbidden');
  }

  try {
    const { data, error } = await access.admin.auth.admin.getUserById(
      access.user.id
    );
    if (error) {
      return errReply(503, 'db_readonly_unavailable', 'Auth check failed.');
    }
    const staff = data.user;
    if (
      !staff ||
      staff.id !== access.user.id ||
      !isVerifiedTuturuuuStaffSession(staff) ||
      !staff.email_confirmed_at ||
      (staff.banned_until &&
        (!Number.isFinite(Date.parse(staff.banned_until)) ||
          Date.parse(staff.banned_until) > Date.now()))
    ) {
      console.warn('[db_cli_readonly] unauthorized_request', {
        requestId,
        status: 403,
      });
      return errReply(403, 'forbidden');
    }
  } catch {
    return errReply(503, 'db_readonly_unavailable', 'Auth unavailable.');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errReply(400, 'invalid_json', 'Invalid JSON.');
  }
  const parsed = PayloadSchema.safeParse(rawBody);
  if (!parsed.success)
    return errReply(400, 'invalid_payload', 'Invalid payload.');

  const env = parsed.data.env ?? 'staging';
  const check = parseReadOnlyQuery(parsed.data.sql, parsed.data.limit);
  const audit = {
    actorId: access.user.id,
    env,
    requestId,
    sqlHash: sha256(check.ok ? check.normalizedSql : parsed.data.sql),
  };
  if (!check.ok) {
    console.warn('[db_cli_readonly] query_rejected', {
      ...audit,
      code: check.code,
      durationMs: Date.now() - startedAt,
    });
    return errReply(check.status, check.code, check.error);
  }

  try {
    const selectCols = check.columns === '*' ? '*' : check.columns.join(',');
    let query = (
      access.admin as unknown as {
        from(table: string): { select(cols: string): PostgrestSelectBuilder };
      }
    )
      .from(check.table)
      .select(selectCols);
    for (const f of check.filters) {
      if (f.op === 'is_null') query = query.is(f.column, null);
      else if (f.op === 'is_not_null') query = query.not(f.column, 'is', null);
      else query = query[f.op](f.column, f.value);
    }
    for (const o of check.orderBy) {
      query = query.order(o.column, { ascending: o.ascending });
    }
    const { data, error } = await query
      .limit(check.limit)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

    const durationMs = Date.now() - startedAt;
    if (error) {
      console.warn('[db_cli_readonly] query_error', {
        ...audit,
        durationMs,
        errorCode: error.code ?? 'query_error',
      });
      return errReply(
        503,
        'db_readonly_query_error',
        'Query execution failed.'
      );
    }
    const rows = Array.isArray(data)
      ? (data as Record<string, unknown>[]).slice(0, check.limit)
      : [];
    const meta = {
      ...audit,
      durationMs,
      limit: check.limit,
      rowCount: rows.length,
      tables: check.tables,
    };
    console.info('[db_cli_readonly] query_executed', meta);
    return reply(200, { ...meta, normalizedSql: check.normalizedSql, rows });
  } catch {
    console.warn('[db_cli_readonly] unexpected_error', {
      ...audit,
      durationMs: Date.now() - startedAt,
    });
    return errReply(503, 'db_readonly_unavailable', 'Executor unavailable.');
  }
}
