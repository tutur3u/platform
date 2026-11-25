// Structural checks for registered raw SQL. Raw statements stay a trusted,
// reviewed exception, so the accepted grammar is deliberately small: one
// SELECT, INSERT … VALUES, UPDATE or DELETE whose verb matches the declared
// action, with no comments, quoted identifiers, OR, CASE, BETWEEN, set
// operations, CTEs, subqueries or RIGHT/FULL joins. Each tenant source must
// carry its own `ws_id = ?1` as a top-level AND of the single WHERE (an
// INSERT must bind ws_id to ?1 in every row). Table kinds are checked
// against the registry by `admitStatements` in defineDatabase, which also
// allows only one tenant table per statement: the declared one. A second
// tenant source would run under the declared table's scope alone, so it is
// out of scope until execution can require a scope and predicate for each
// tenant source (open for step 4).

import type { Action } from '@tuturuuu/authz';

type Token = Readonly<{
  type: 'word' | 'param' | 'number' | 'string' | 'punct';
  text: string;
}>;

export type SqlSource = Readonly<{ table: string; alias: string }>;

export type ParsedSql = Readonly<{
  verb: 'select' | 'insert' | 'update' | 'delete';
  sources: readonly SqlSource[];
  /** Aliases with a top-level `ws_id = ?1` (every source for an INSERT). */
  scoped: ReadonlySet<string>;
}>;

const VERBS: Readonly<Record<string, ParsedSql['verb']>> = {
  read: 'select',
  list: 'select',
  create: 'insert',
  update: 'update',
  delete: 'delete',
};
// Words refused anywhere outside string literals. Besides constructs that
// break the top-level AND split (OR, CASE, BETWEEN) and set operations or
// CTEs, this covers SQLite syntax that can name a table without FROM or
// JOIN, or change how a named table is read: MATCH on a table name,
// INDEXED BY / NOT INDEXED, WITHOUT ROWID, and statement keywords such as
// PRAGMA, REINDEX, ATTACH, VACUUM and EXPLAIN. `x IN table` and
// `x IN fn(...)` are handled by checkIn.
const BANNED = new Set(
  [
    'or union intersect except with natural right full using between case exists',
    'match indexed without pragma reindex attach detach vacuum analyze explain',
    'create drop alter trigger virtual temp temporary begin commit rollback savepoint release',
  ]
    .join(' ')
    .split(' ')
);
const KEYWORDS = new Set(
  'on inner left cross join outer where group order limit offset having window as set select from values returning'.split(
    ' '
  )
);
const CLAUSE_END = new Set([
  'group',
  'order',
  'limit',
  'offset',
  'having',
  'window',
  'returning',
]);

// SQLite's whitespace outside literals; anything else non-ASCII is refused.
const SQL_SPACE = new Set([' ', '\t', '\n', '\f', '\r']);

class SqlError extends Error {}
const fail = (message: string): never => {
  throw new SqlError(message);
};

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql.charAt(i);
    const rest = sql.slice(i);
    if (SQL_SPACE.has(c)) i += 1;
    else if (rest.startsWith('--') || rest.startsWith('/*'))
      fail('comments are refused');
    else if (c === "'") {
      const match = rest.match(/^'(?:[^']|'')*'/);
      if (!match) return fail('unterminated string');
      tokens.push({ type: 'string', text: match[0] });
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const word = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)![0];
      tokens.push({ type: 'word', text: word.toLowerCase() });
      i += word.length;
    } else if (/[0-9]/.test(c)) {
      const number = rest.match(/^[0-9]+(?:\.[0-9]+)?/)![0];
      tokens.push({ type: 'number', text: number });
      i += number.length;
    } else if (c === '?') {
      const param = rest.match(/^\?[1-9][0-9]*/);
      if (!param) return fail('use numbered ?N parameters');
      tokens.push({ type: 'param', text: param[0] });
      i += param[0].length;
    } else if ('(),.=<>!+-*/%|;'.includes(c)) {
      tokens.push({ type: 'punct', text: c });
      i += 1;
    } else fail(`unsupported character ${c}`);
  }
  if (tokens.at(-1)?.text === ';') tokens.pop();
  if (tokens.some((token) => token.text === ';')) fail('one statement only');
  return tokens;
}

const isWord = (token: Token | undefined, text?: string) =>
  token?.type === 'word' && (text === undefined || token.text === text);

/** Splits tokens at `separator` where parenthesis depth is zero. */
function split(tokens: readonly Token[], separator: (token: Token) => boolean) {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.text === '(') depth += 1;
    if (token.text === ')') depth -= 1;
    if (depth < 0) fail('unbalanced parentheses');
    if (depth === 0 && separator(token)) parts.push([]);
    else parts.at(-1)!.push(token);
  }
  if (depth !== 0) fail('unbalanced parentheses');
  return parts;
}

function readSource(
  tokens: readonly Token[],
  at: number,
  columnList = false
): [SqlSource, number] {
  const table = tokens[at];
  if (!isWord(table) || KEYWORDS.has(table!.text))
    fail('expected a table name');
  let i = at + 1;
  if (tokens[i]?.text === '.') fail('schema-qualified tables are refused');
  if (tokens[i]?.text === '(' && !columnList)
    fail('table functions are refused');
  let alias = table!.text;
  if (isWord(tokens[i], 'as')) {
    if (!isWord(tokens[i + 1]) || KEYWORDS.has(tokens[i + 1]!.text))
      fail('expected an alias');
    alias = tokens[i + 1]!.text;
    i += 2;
  } else if (isWord(tokens[i]) && !KEYWORDS.has(tokens[i]!.text)) {
    alias = tokens[i]!.text;
    i += 1;
  }
  return [{ table: table!.text, alias }, i];
}

function parseFrom(tokens: readonly Token[]): SqlSource[] {
  const sources: SqlSource[] = [];
  let [source, i] = readSource(tokens, 0);
  sources.push(source);
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.text === ',') {
      [source, i] = readSource(tokens, i + 1);
      sources.push(source);
      continue;
    }
    if (isWord(token, 'left')) i += isWord(tokens[i + 1], 'outer') ? 2 : 1;
    else if (isWord(token, 'inner') || isWord(token, 'cross')) i += 1;
    if (!isWord(tokens[i], 'join')) fail(`unexpected ${token.text} in FROM`);
    [source, i] = readSource(tokens, i + 1);
    sources.push(source);
    if (isWord(tokens[i], 'on')) {
      let depth = 0;
      for (i += 1; i < tokens.length; i += 1) {
        const t = tokens[i]!;
        if (t.text === '(') depth += 1;
        if (t.text === ')') depth -= 1;
        const next =
          t.text === ',' || ['inner', 'left', 'cross', 'join'].includes(t.text);
        if (depth === 0 && next && t.type !== 'string') break;
      }
    }
  }
  return sources;
}

/**
 * SQLite reads `x IN table`, `x IN schema.table` and `x IN fn(...)` as
 * subqueries, so IN must be followed by a parenthesised, non-empty list of
 * parameters and literals.
 */
function checkIn(tokens: readonly Token[]) {
  tokens.forEach((token, at) => {
    if (!isWord(token, 'in')) return;
    const message =
      'IN accepts only a parenthesised list of parameters and literals';
    if (tokens[at + 1]?.text !== '(') fail(message);
    const close = tokens.findIndex((t, i) => i > at + 1 && t.text === ')');
    if (close < 0) fail(message);
    for (const item of split(
      tokens.slice(at + 2, close),
      (t) => t.text === ','
    )) {
      const only = item.length === 1 ? item[0] : undefined;
      if (!only || !['param', 'number', 'string'].includes(only.type))
        fail(message);
    }
  });
}

/** Aliases with a top-level `[alias.]ws_id = ?1` conjunct. */
function scopedAliases(where: readonly Token[], sources: readonly SqlSource[]) {
  const scoped = new Set<string>();
  for (const part of split(where, (token) => isWord(token, 'and'))) {
    const text = part.map((token) => token.text);
    const eq = text.indexOf('=');
    if (eq < 0 || text.lastIndexOf('=') !== eq) continue;
    const sides = [text.slice(0, eq), text.slice(eq + 1)];
    const column = sides.find((side) => side.join(' ') !== '?1');
    if (!column || !sides.some((side) => side.join(' ') === '?1')) continue;
    if (column.length === 1 && column[0] === 'ws_id') {
      if (sources.length !== 1)
        fail('qualify ws_id when several tables are read');
      scoped.add(sources[0]!.alias);
    } else if (
      column.length === 3 &&
      column[1] === '.' &&
      column[2] === 'ws_id'
    ) {
      scoped.add(column[0]!);
    }
  }
  return scoped;
}

function clause(tokens: readonly Token[], from: number) {
  let end = from;
  while (
    end < tokens.length &&
    !(isWord(tokens[end]) && CLAUSE_END.has(tokens[end]!.text))
  )
    end += 1;
  return tokens.slice(from, end);
}

function indexOfWord(tokens: readonly Token[], word: string, missing: string) {
  const at = tokens.findIndex((token) => isWord(token, word));
  if (at < 0) fail(missing);
  if (tokens.findIndex((t, i) => i > at && isWord(t, word)) >= 0) {
    fail(`expected exactly one ${word.toUpperCase()}`);
  }
  return at;
}

function parseInsert(tokens: readonly Token[]): ParsedSql {
  if (!isWord(tokens[1], 'into')) fail('expected INSERT INTO');
  if (tokens.some((token) => isWord(token, 'on') || isWord(token, 'default'))) {
    fail('ON CONFLICT and DEFAULT VALUES are refused');
  }
  const [source, open] = readSource(tokens, 2, true);
  if (tokens[open]?.text !== '(') fail('INSERT needs a column list');
  const close = tokens.findIndex((t, i) => i > open && t.text === ')');
  const columns = split(
    tokens.slice(open + 1, close),
    (t) => t.text === ','
  ).map((c) =>
    c.length === 1 && isWord(c[0])
      ? c[0]!.text
      : fail('unsupported column list')
  );
  const ws = columns.indexOf('ws_id');
  if (ws < 0 || columns.lastIndexOf('ws_id') !== ws)
    fail('INSERT must set ws_id once');
  if (!isWord(tokens[close + 1], 'values')) fail('INSERT needs VALUES');
  const rest = clause(tokens, close + 2);
  for (const tuple of split(rest, (t) => t.text === ',')) {
    if (tuple[0]?.text !== '(' || tuple.at(-1)?.text !== ')')
      fail('unsupported VALUES row');
    const values = split(tuple.slice(1, -1), (t) => t.text === ',');
    if (values.length !== columns.length)
      fail('VALUES row does not match the columns');
    if (values[ws]?.length !== 1 || values[ws]![0]!.text !== '?1')
      fail('ws_id must be bound to ?1');
  }
  return { verb: 'insert', sources: [source], scoped: new Set([source.alias]) };
}

function parse(tokens: readonly Token[], verb: ParsedSql['verb']): ParsedSql {
  if (verb === 'insert') return parseInsert(tokens);
  const where = indexOfWord(tokens, 'where', 'must filter ws_id = ?1 in WHERE');
  let sources: SqlSource[];
  if (verb === 'select') {
    const from = indexOfWord(tokens, 'from', 'expected FROM');
    if (from > where) fail('FROM must come before WHERE');
    sources = parseFrom(tokens.slice(from + 1, where));
  } else if (verb === 'update') {
    if (tokens.some((token) => isWord(token, 'from')))
      fail('UPDATE … FROM is refused');
    const [source, set] = readSource(tokens, 1);
    if (!isWord(tokens[set], 'set')) fail('expected SET');
    if (tokens.slice(set, where).some((token) => isWord(token, 'ws_id')))
      fail('ws_id may not be assigned');
    sources = [source];
  } else {
    if (!isWord(tokens[1], 'from')) fail('expected DELETE FROM');
    const [source, next] = readSource(tokens, 2);
    if (next !== where) fail('unexpected tokens before WHERE');
    sources = [source];
  }
  return {
    verb,
    sources,
    scoped: scopedAliases(clause(tokens, where + 1), sources),
  };
}

/** Parses `sql` for a statement on `table` or throws with the reason. */
/**
 * SQLite's lexer and JavaScript strings disagree on NUL and other C0
 * controls (SQLite stops at NUL), so they are refused everywhere, inside
 * literals too; only tab, newline, form feed and carriage return pass.
 */
function checkControls(sql: string) {
  for (const char of sql) {
    const code = char.charCodeAt(0);
    const allowed = code === 9 || code === 10 || code === 12 || code === 13;
    if ((code < 32 && !allowed) || code === 127) {
      fail('control characters are refused');
    }
  }
}

export function checkSql(
  name: string,
  sql: string,
  table: string,
  action: Action
): ParsedSql {
  try {
    checkControls(sql);
    const tokens = tokenize(sql);
    const words = tokens
      .filter((token) => token.type === 'word')
      .map((token) => token.text);
    if (words.includes('replace')) fail('REPLACE is refused');
    const banned = words.find((word) => BANNED.has(word));
    if (banned) fail(`${banned.toUpperCase()} is refused`);
    checkIn(tokens);
    const verb = VERBS[action];
    if (!verb || words[0] !== verb)
      fail(`verb ${words[0]?.toUpperCase()} does not match action ${action}`);
    const selects = words.filter((word) => word === 'select').length;
    if (selects !== (verb === 'select' ? 1 : 0)) fail('subqueries are refused');
    const parsed = parse(tokens, verb!);
    const own = parsed.sources.filter((source) => source.table === table);
    if (own.length === 0)
      fail(`statement table ${table} is not in the statement`);
    if (verb !== 'select' && parsed.sources[0]?.table !== table)
      fail(`statement must write ${table}`);
    if (own.some((source) => !parsed.scoped.has(source.alias))) {
      fail(`must filter ws_id = ?1 as a top-level AND for ${table}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SqlError)
      throw new Error(`Statement ${name}: ${error.message}`);
    throw error;
  }
}
