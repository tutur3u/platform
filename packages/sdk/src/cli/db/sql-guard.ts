import { CLI_EXIT, CliError } from '../cli-contracts';

export const DB_DEFAULT_LIMIT = 100;
export const DB_MAX_LIMIT = 500;
const MAX_SQL_LENGTH = 16_000;
const MAX_COLUMNS = 32;
const MAX_FILTERS = 12;
const MAX_ORDER_TERMS = 4;
const SIMPLE_IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/iu;
const toSet = (s: string) => new Set(s.trim().split(/\s+/u));

export const DB_READONLY_ALLOWLISTED_TABLES: ReadonlySet<string> =
  Object.freeze(
    toSet(
      'task_lists task_projects tasks workspace_boards workspace_settings workspace_task_labels workspaces'
    )
  );
export const DB_FORBIDDEN_SCHEMAS: ReadonlySet<string> = Object.freeze(
  toSet('auth extensions private realtime storage supabase_functions vault')
);

const FORBIDDEN_KW = toSet(
  'ALTER ANALYSE ANALYZE CALL CHECKPOINT CLUSTER COPY CREATE CURRENT_SETTING CURSOR_TO_XML DATABASE_TO_XML DBLINK DBLINK_CONNECT DBLINK_EXEC DEALLOCATE DELETE DISCARD DO DROP EXECUTE EXPLAIN FOR GRANT IMPORT INSERT INTO JOIN LATERAL LISTEN LO_CREATE LO_EXPORT LO_FROM_BYTEA LO_IMPORT LO_PUT LO_UNLINK LOCK MERGE NOTIFY PG_CANCEL_BACKEND PG_LS_DIR PG_LS_LOGDIR PG_LS_TMPDIR PG_LS_WALDIR PG_READ_BINARY_FILE PG_READ_FILE PG_RELOAD_CONF PG_ROTATE_LOGFILE PG_STAT_FILE PG_TERMINATE_BACKEND PREPARE QUERY_TO_XML REFRESH REINDEX RESET REVOKE SET SET_CONFIG SHOW TABLE_TO_XML TRUNCATE UNION UNLISTEN UPDATE UPSERT VACUUM WITH'
);
const LEX_RE =
  /(\s+)|(--)|(\/\*)|([uU]&['"])|(\$(?:[A-Za-z_]\w*)?\$)|('(?:''|[^'])*')|("(?:""|[^"])+")|(<=|>=|<>|!=|[=<>.,;*()])|([A-Za-z_]\w*)|(-?[0-9]+(?:\.[0-9]+)?)|(['"])|(.)/uy;

interface Tok {
  kind: 'ident' | 'number' | 'op' | 'string' | 'word';
  raw: string;
  value: string;
}

export type ReadOnlyFilterOp =
  | 'eq'
  | 'gt'
  | 'gte'
  | 'is_not_null'
  | 'is_null'
  | 'lt'
  | 'lte'
  | 'neq';

export interface ReadOnlyFilter {
  column: string;
  op: ReadOnlyFilterOp;
  value: boolean | number | string | null;
}

export interface ReadOnlyOrderTerm {
  ascending: boolean;
  column: string;
}

export interface ValidateReadOnlySqlOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface ValidatedReadOnlySql {
  columns: '*' | string[];
  filters: ReadOnlyFilter[];
  limit: number;
  normalizedSql: string;
  orderBy: ReadOnlyOrderTerm[];
  redactedSql: string;
  table: string;
  tables: string[];
}

const err = (code: string, message: string, usage = false) =>
  new CliError({
    code,
    exitCode: usage ? CLI_EXIT.usage : CLI_EXIT.policy,
    message,
  });
const isW = (t: Tok | undefined, u: string) =>
  t?.kind === 'word' && t.value.toUpperCase() === u;
const isId = (t: Tok | undefined): t is Tok =>
  t !== undefined && (t.kind === 'word' || t.kind === 'ident');

function requireColumn(tok: Tok | undefined): string {
  if (!isId(tok) || !SIMPLE_IDENT_RE.test(tok.value))
    throw err('DB_SQL_INVALID_COLUMN', 'Invalid column identifier.');
  const lower = tok.value.toLowerCase();
  if (FORBIDDEN_KW.has(lower.toUpperCase()))
    throw err('DB_SQL_FORBIDDEN_KEYWORD', `Forbidden keyword "${lower}".`);
  return lower;
}

export function tokenizeReadOnlySql(sql: string): Tok[] {
  if (typeof sql !== 'string' || !sql.trim())
    throw err('DB_SQL_EMPTY', 'Empty SQL.', true);
  if (sql.length > MAX_SQL_LENGTH)
    throw err('DB_SQL_TOO_LONG', `SQL > ${MAX_SQL_LENGTH} chars.`);
  if (sql.includes('\0')) throw err('DB_SQL_INVALID', 'SQL contains NUL byte.');

  const tokens: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    LEX_RE.lastIndex = i;
    const m = LEX_RE.exec(sql);
    if (!m) throw err('DB_SQL_INVALID', 'Unable to tokenize SQL.');
    if (m[1]) {
      i = LEX_RE.lastIndex;
      continue;
    }
    if (m[2] || m[3])
      throw err('DB_SQL_COMMENTS_FORBIDDEN', 'SQL comments are forbidden.');
    if (m[4]) throw err('DB_SQL_FORBIDDEN_SYNTAX', 'U& escapes forbidden.');
    if (m[5])
      throw err('DB_SQL_DOLLAR_QUOTE_FORBIDDEN', 'Dollar quotes forbidden.');
    if (m[11])
      throw err('DB_SQL_UNTERMINATED_STRING', 'Unterminated literal/ident.');
    if (m[12])
      throw err('DB_SQL_FORBIDDEN_SYNTAX', `Unsupported SQL token "${m[12]}".`);
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
  return tokens;
}

function parseLiteral(tok: Tok | undefined): boolean | number | string {
  if (!tok) throw err('DB_SQL_INVALID', 'Missing literal value in WHERE.');
  if (tok.kind === 'string') return tok.value;
  if (tok.kind === 'number') {
    const n = Number(tok.value);
    if (!Number.isFinite(n)) throw err('DB_SQL_INVALID', 'Invalid number.');
    return n;
  }
  if (isW(tok, 'TRUE')) return true;
  if (isW(tok, 'FALSE')) return false;
  throw err('DB_SQL_INVALID', 'WHERE requires scalar literal values.');
}

function formatLiteral(value: boolean | number | string): string {
  if (typeof value === 'string') return `'${value.replace(/'/gu, "''")}'`;
  return String(value);
}

function formatCanonicalSql(
  plan: {
    columns: '*' | string[];
    filters: ReadOnlyFilter[];
    limit: number;
    orderBy: ReadOnlyOrderTerm[];
    table: string;
  },
  redactLiterals = false
): string {
  const cols = plan.columns === '*' ? '*' : plan.columns.join(', ');
  const parts = [`SELECT ${cols} FROM public.${plan.table}`];
  if (plan.filters.length > 0) {
    const ops: Record<
      Exclude<ReadOnlyFilterOp, 'is_not_null' | 'is_null'>,
      string
    > = {
      eq: '=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      neq: '!=',
    };
    const exprs = plan.filters.map((f) => {
      if (f.op === 'is_null') return `${f.column} IS NULL`;
      if (f.op === 'is_not_null') return `${f.column} IS NOT NULL`;
      const rendered = redactLiterals
        ? "'[redacted]'"
        : formatLiteral(f.value as boolean | number | string);
      return `${f.column} ${ops[f.op]} ${rendered}`;
    });
    parts.push(`WHERE ${exprs.join(' AND ')}`);
  }
  if (plan.orderBy.length > 0) {
    parts.push(
      `ORDER BY ${plan.orderBy.map((o) => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    );
  }
  parts.push(`LIMIT ${plan.limit}`);
  return parts.join(' ');
}

export function validateReadOnlySql(
  sql: string,
  options: ValidateReadOnlySqlOptions = {}
): ValidatedReadOnlySql {
  const maxLimit = options.maxLimit ?? DB_MAX_LIMIT;
  if (!Number.isInteger(maxLimit) || maxLimit < 1 || maxLimit > DB_MAX_LIMIT)
    throw err('DB_SQL_LIMIT_EXCEEDED', `maxLimit must be 1..${DB_MAX_LIMIT}.`);
  const defaultLimit = Math.min(
    options.defaultLimit ?? DB_DEFAULT_LIMIT,
    maxLimit
  );

  const tokens = tokenizeReadOnlySql(sql);
  const semis = tokens.flatMap((t, idx) => (t.raw === ';' ? [idx] : []));
  if (
    semis.length > 1 ||
    (semis.length === 1 && semis[0] !== tokens.length - 1)
  )
    throw err('DB_SQL_MULTIPLE_STATEMENTS', 'Multiple statements forbidden.');
  const clean = semis.length === 1 ? tokens.slice(0, -1) : tokens;
  if (!clean.length) throw err('DB_SQL_EMPTY', 'Empty SQL.', true);

  for (let i = 0; i < clean.length; i += 1) {
    const t = clean[i]!;
    if (t.kind === 'string') continue;
    if (isId(t) && FORBIDDEN_KW.has(t.value.toUpperCase()))
      throw err(
        'DB_SQL_FORBIDDEN_KEYWORD',
        `Forbidden keyword "${t.value.toUpperCase()}".`
      );
    if (
      t.raw === '.' &&
      isId(clean[i - 1]) &&
      DB_FORBIDDEN_SCHEMAS.has(clean[i - 1]!.value.toLowerCase())
    )
      throw err(
        'DB_SQL_SCHEMA_FORBIDDEN',
        `Schema "${clean[i - 1]!.value.toLowerCase()}" blocked.`
      );
  }

  let idx = 0;
  if (!isW(clean[idx], 'SELECT'))
    throw err(
      'DB_SQL_FORBIDDEN_STATEMENT',
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
      list.push(requireColumn(clean[idx]));
      idx += 1;
      if (list.length > MAX_COLUMNS)
        throw err('DB_SQL_TOO_MANY_COLUMNS', `At most ${MAX_COLUMNS} columns.`);
      if (clean[idx]?.raw === ',') {
        idx += 1;
        continue;
      }
      break;
    }
    if (!list.length)
      throw err('DB_SQL_INVALID', 'SELECT requires a column list or *.');
    columns = list;
  }

  if (!isW(clean[idx], 'FROM'))
    throw err('DB_SQL_INVALID', 'Expected FROM clause after SELECT columns.');
  idx += 1;

  if (!isId(clean[idx]))
    throw err('DB_SQL_INVALID', 'Expected allowlisted table name after FROM.');
  let schema: string | null = null;
  let table = clean[idx]!.value.toLowerCase();
  idx += 1;
  if (clean[idx]?.raw === '.') {
    schema = table;
    idx += 1;
    if (!isId(clean[idx]))
      throw err('DB_SQL_INVALID', 'Expected table name after schema.');
    table = clean[idx]!.value.toLowerCase();
    idx += 1;
    if (clean[idx]?.raw === '.')
      throw err('DB_SQL_SCHEMA_FORBIDDEN', 'Cross-db ref blocked.');
  }
  if (schema !== null) {
    if (DB_FORBIDDEN_SCHEMAS.has(schema))
      throw err('DB_SQL_SCHEMA_FORBIDDEN', `Schema "${schema}" blocked.`);
    if (schema !== 'public')
      throw err(
        'DB_SQL_TABLE_NOT_ALLOWLISTED',
        `Schema "${schema}" is not allowlisted.`
      );
  }
  if (!DB_READONLY_ALLOWLISTED_TABLES.has(table))
    throw err(
      'DB_SQL_TABLE_NOT_ALLOWLISTED',
      `Table "${table}" not allowlisted.`
    );

  const filters: ReadOnlyFilter[] = [];
  if (isW(clean[idx], 'WHERE')) {
    idx += 1;
    while (idx < clean.length) {
      if (filters.length >= MAX_FILTERS)
        throw err('DB_SQL_TOO_MANY_FILTERS', `At most ${MAX_FILTERS} filters.`);
      const column = requireColumn(clean[idx]);
      idx += 1;
      if (isW(clean[idx], 'IS')) {
        idx += 1;
        let negated = false;
        if (isW(clean[idx], 'NOT')) {
          negated = true;
          idx += 1;
        }
        if (!isW(clean[idx], 'NULL'))
          throw err('DB_SQL_INVALID', 'Expected NULL after IS [NOT].');
        idx += 1;
        filters.push({
          column,
          op: negated ? 'is_not_null' : 'is_null',
          value: null,
        });
      } else {
        const rawOp = clean[idx]?.kind === 'op' ? clean[idx]!.raw : '';
        const opMap: Record<string, ReadOnlyFilterOp> = {
          '!=': 'neq',
          '<': 'lt',
          '<=': 'lte',
          '<>': 'neq',
          '=': 'eq',
          '>': 'gt',
          '>=': 'gte',
        };
        const op = opMap[rawOp];
        if (!op)
          throw err('DB_SQL_INVALID', 'Unsupported WHERE comparison operator.');
        idx += 1;
        filters.push({ column, op, value: parseLiteral(clean[idx]) });
        idx += 1;
      }
      if (isW(clean[idx], 'AND')) {
        idx += 1;
        continue;
      }
      break;
    }
  }

  const orderBy: ReadOnlyOrderTerm[] = [];
  if (isW(clean[idx], 'ORDER')) {
    idx += 1;
    if (!isW(clean[idx], 'BY'))
      throw err('DB_SQL_INVALID', 'Expected BY after ORDER.');
    idx += 1;
    while (idx < clean.length) {
      if (orderBy.length >= MAX_ORDER_TERMS)
        throw err(
          'DB_SQL_INVALID',
          `At most ${MAX_ORDER_TERMS} ORDER BY cols.`
        );
      const column = requireColumn(clean[idx]);
      idx += 1;
      let ascending = true;
      if (isW(clean[idx], 'ASC')) {
        idx += 1;
      } else if (isW(clean[idx], 'DESC')) {
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

  let limit = defaultLimit;
  if (isW(clean[idx], 'LIMIT')) {
    idx += 1;
    const tok = clean[idx];
    if (!tok || tok.kind !== 'number' || !/^\d+$/u.test(tok.value))
      throw err('DB_SQL_LIMIT_EXCEEDED', `Row limit must be 1..${maxLimit}.`);
    const parsedLimit = Number(tok.value);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > maxLimit
    )
      throw err('DB_SQL_LIMIT_EXCEEDED', `Row limit must be 1..${maxLimit}.`);
    limit = parsedLimit;
    idx += 1;
  }

  if (idx !== clean.length)
    throw err(
      'DB_SQL_FORBIDDEN_SYNTAX',
      'Unexpected trailing SQL clause or expression.'
    );

  return {
    columns,
    filters,
    limit,
    normalizedSql: formatCanonicalSql({
      columns,
      filters,
      limit,
      orderBy,
      table,
    }),
    orderBy,
    redactedSql: formatCanonicalSql(
      { columns, filters, limit, orderBy, table },
      true
    ),
    table,
    tables: [table],
  };
}
