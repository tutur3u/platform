#!/usr/bin/env node

// Fails when a new migration or rollback grants privileges to PUBLIC or anon,
// or when a new migration creates/alters a SECURITY DEFINER routine without
// subsequently revoking EXECUTE from PUBLIC and anon in the same file. Files before the cutoff are
// legacy; `--report` lists them for visibility without failing.
// Policy: apps/docs/reference/database/migrations-guide.mdx#sql-grant-guard

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const ROLLBACKS_DIR = 'apps/database/rollbacks';
// Files whose version prefix is below this predate the rule.
const MIGRATION_CUTOFF = '20261028000000';
const OPEN_ROLES = ['public', 'anon'];
const RULES = {
  anonGrant: 'anon-grant',
  definerPublic: 'definer-public',
};
const ALLOW_MARKERS = {
  [RULES.anonGrant]: 'allow-anon-grant',
  [RULES.definerPublic]: 'allow-definer-public',
};

// --- Lexing --------------------------------------------------------------

// Returns the SQL with comments, string literals and dollar-quoted bodies
// blanked (newlines kept, so line numbers survive), plus the `--` comments.
function lexSql(sql, { keepStrings = false } = {}) {
  let code = '';
  let line = 1;
  let index = 0;
  const comments = [];
  const bodies = [];
  const identifiers = [];
  const emit = (end, keep) => {
    const chunk = sql.slice(index, end);
    code += keep ? chunk : chunk.replace(/[^\n]/g, ' ');
    for (const char of chunk) if (char === '\n') line++;
    index = end;
  };

  while (index < sql.length) {
    const char = sql[index];
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index);
      const end = newline < 0 ? sql.length : newline;
      comments.push({ line, start: index, text: sql.slice(index + 2, end) });
      emit(end, false);
    } else if (sql.startsWith('/*', index)) {
      let depth = 0;
      let cursor = index;
      while (cursor < sql.length) {
        if (sql.startsWith('/*', cursor)) {
          depth++;
          cursor += 2;
        } else if (sql.startsWith('*/', cursor)) {
          depth--;
          cursor += 2;
          if (depth === 0) break;
        } else cursor++;
      }
      emit(cursor, false);
    } else if (char === "'") {
      const escapes =
        /[eE]/.test(sql[index - 1] ?? '') &&
        !/[\w$]/.test(sql[index - 2] ?? '');
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (escapes && sql[cursor] === '\\') cursor += 2;
        else if (sql[cursor] !== "'") cursor++;
        else if (sql[cursor + 1] === "'") cursor += 2;
        else {
          cursor++;
          break;
        }
      }
      emit(Math.min(cursor, sql.length), keepStrings);
    } else if (char === '"' || /^[uU]&"/.test(sql.slice(index, index + 3))) {
      const unicode = char !== '"';
      const quote = index + (unicode ? 2 : 0);
      let cursor = quote + 1;
      while (cursor < sql.length) {
        if (sql[cursor] !== '"') cursor++;
        else if (sql[cursor + 1] === '"') cursor += 2;
        else break;
      }
      let identifier = sql.slice(quote + 1, cursor);
      let end = Math.min(cursor + 1, sql.length);
      if (unicode) {
        const escapeClause = /^\s+uescape\s+'(.)'/i.exec(sql.slice(end));
        const escapeChar = escapeClause?.[1] ?? '\\';
        if (escapeClause) end += escapeClause[0].length;
        identifier = identifier
          .replace(/[\s\S]/g, (character) =>
            character === escapeChar ? '\\' : character
          )
          .replace(/\\(?:\+([0-9a-f]{6})|([0-9a-f]{4}))/gi, (_, long, short) =>
            String.fromCodePoint(parseInt(long ?? short, 16))
          );
      }
      // Keep source offsets while masking delimiters; restore unique tokens
      // after splitting statements. UTF-16 hex also preserves lone surrogates.
      if (!/^[A-Za-z0-9_$]+$/.test(identifier)) {
        identifiers.push({
          start: index,
          end,
          token: `"\uE000${Buffer.from(identifier, 'utf16le').toString('hex')}"`,
        });
      }
      const safe = `"${/^[A-Za-z0-9_$]+$/.test(identifier) ? identifier : identifier.replace(/[^\n]/g, '_')}"`;
      const chunk = sql.slice(index, end);
      code += safe + ' '.repeat(Math.max(0, chunk.length - safe.length));
      line += countNewlines(chunk);
      index = end;
    } else {
      const tag =
        char === '$' && !/[\w$]/.test(sql[index - 1] ?? '')
          ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
              sql.slice(index, index + 64)
            )
          : null;
      if (tag) {
        const close = sql.indexOf(tag[0], index + tag[0].length);
        const start = index + tag[0].length;
        const end = close < 0 ? sql.length : close;
        bodies.push({ start, end, line, text: sql.slice(start, end) });
        emit(close < 0 ? sql.length : close + tag[0].length, false);
      } else {
        code += char;
        if (char === '\n') line++;
        index++;
      }
    }
  }
  return { code, comments, bodies, identifiers };
}

function countNewlines(text) {
  return text.split('\n').length - 1;
}

// Splits lexed SQL into normalized (lowercase, single-spaced) statements.
function parseStatements(sql) {
  const { code, comments, bodies, identifiers } = lexSql(sql);
  const statements = [];
  let line = 1;
  let offset = 0;
  for (const part of code.split(';')) {
    const startLine = line + countNewlines(/^\s*/.exec(part)[0]);
    const body = part.trim();
    if (body) {
      const text = identifiers
        .filter(
          (entry) => entry.start >= offset && entry.end <= offset + part.length
        )
        .reduceRight(
          (text, entry) =>
            text.slice(0, entry.start - offset) +
            entry.token +
            text.slice(entry.end - offset),
          part
        );
      statements.push({
        text: text.trim().replace(/\s+/g, ' ').toLowerCase(),
        start: offset + part.indexOf(body),
        end: offset + part.length,
        startLine,
        endLine: line + countNewlines(part),
      });
    }
    line += countNewlines(part);
    offset += part.length + 1;
  }
  const pending = [...bodies];
  for (let index = 0; index < pending.length; index++) {
    const body = pending[index];
    const nested = lexSql(body.text);
    for (const child of nested.bodies) {
      pending.push({
        ...child,
        start: body.start + child.start,
        end: body.start + child.end,
        line: body.line + child.line - 1,
      });
    }
    for (const comment of nested.comments) {
      comments.push({
        ...comment,
        start: body.start + comment.start,
        line: body.line + comment.line - 1,
      });
    }
  }
  for (const comment of comments) {
    comment.statement = statements.find(
      (statement) =>
        comment.start >= statement.start && comment.start <= statement.end
    );
    if (comment.statement) continue;
    // A trailing comment belongs to the immediately preceding statement only.
    const previous = statements
      .filter((statement) => statement.end < comment.start)
      .at(-1);
    if (previous?.endLine === comment.line) {
      comment.statement = previous;
    } else {
      comment.statement = statements.find(
        (statement) =>
          statement.start > comment.start &&
          statement.startLine === comment.line + 1
      );
    }
  }
  return { statements, comments, bodies };
}

function isAllowed(statement, comments, rule) {
  const marker = new RegExp(`^\\s*${ALLOW_MARKERS[rule]}\\s*:\\s*\\S`, 'i');
  return comments.some(
    (comment) => comment.statement === statement && marker.test(comment.text)
  );
}

// --- Identifiers and signatures -----------------------------------------

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function normalizeName(name) {
  const plain = name.replace(/"/g, '').trim();
  return plain.includes('.') ? plain : `public.${plain}`;
}

const MULTI_WORD_TYPES =
  /^(?:double precision|character varying|bit varying|time(?:stamp)?(?:\s?\(\d+\))? with(?:out)? time zone)\b/;
const TYPE_ALIASES = {
  bool: 'boolean',
  decimal: 'numeric',
  float4: 'real',
  float8: 'double precision',
  int: 'integer',
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  timestamptz: 'timestamp with time zone',
  timetz: 'time with time zone',
  varchar: 'character varying',
};

function normalizeType(type) {
  const plain = type
    .replace(/"/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[\s*\d*\s*\]/g, '[]')
    .replace(/^public\./, '')
    .trim();
  const array = plain.endsWith('[]') ? '[]' : '';
  const base = array ? plain.slice(0, -2) : plain;
  return `${TYPE_ALIASES[base] ?? base}${array}`;
}

// Returns the identity argument types of a function argument list, which may
// carry argument names, modes and defaults (CREATE) or types only (REVOKE).
function signatureTypes(argumentList) {
  const types = [];
  for (const raw of splitTopLevel(argumentList)) {
    let argument = raw.replace(/\s*(?:\bdefault\b|=).*$/, '').trim();
    const mode = /^(in|out|inout|variadic)\s+/.exec(argument);
    if (mode) {
      if (mode[1] === 'out') continue;
      argument = argument.slice(mode[0].length);
    }
    const tokens = argument.split(' ');
    const named = tokens.length > 1 && !MULTI_WORD_TYPES.test(argument);
    types.push(normalizeType(named ? tokens.slice(1).join(' ') : argument));
  }
  return types;
}

// Reads `name(args)` at the start of text; returns the name, the argument
// list (null when absent) and the remaining text.
function readRoutine(text) {
  const name = /^\s*((?:"[^"]*"|[^\s(,])+)\s?/.exec(text);
  if (!name) return null;
  let rest = text.slice(name[0].length);
  if (!rest.startsWith('(')) {
    return { name: normalizeName(name[1]), args: null, rest };
  }
  let depth = 0;
  let index = 0;
  for (; index < rest.length; index++) {
    if (rest[index] === '(') depth++;
    if (rest[index] === ')' && --depth === 0) break;
  }
  const args = rest.slice(1, index);
  rest = rest.slice(index + 1);
  return { name: normalizeName(name[1]), args, rest };
}

function roleList(text) {
  return text
    .replace(/\s(?:with\s.*|granted by\s.*|cascade|restrict)$/, '')
    .split(',')
    .map((role) =>
      role
        .trim()
        .replace(/^group\s+/, '')
        .replace(/"/g, '')
    );
}

// --- Rules ---------------------------------------------------------------

const GRANT = /^(?:alter default privileges\s.*?)?\bgrant\s(.+?)\sto\s(.+)$/;
const DEFINER =
  /^(?:create (?:or replace )?|alter )(function|procedure|routine)\s(.+)$/;
const REVOKE_FUNCTION =
  /^revoke\s(?:all(?: privileges)?|execute)\son (function|procedure|routine)s?\s(.+?)\sfrom\s(.+)$/;

function openGrantees(text) {
  if (!/^(?:grant|alter default privileges)\s/.test(text)) return [];
  const match = GRANT.exec(text);
  if (!match) return [];
  return roleList(match[2]).filter((role) => OPEN_ROLES.includes(role));
}

function routineKey(name, types) {
  return types ? `${name}(${types.join(',')})` : name;
}

function scanBodyGrants(initialBody) {
  const findings = [];
  const pending = [initialBody];
  for (let index = 0; index < pending.length; index++) {
    const body = pending[index];
    const { code, bodies } = lexSql(body.text, { keepStrings: true });
    for (const nested of bodies) {
      pending.push({ ...nested, line: body.line + nested.line - 1 });
    }
    const pattern = /\bgrant\b[^;']*/gi;
    for (const match of code.matchAll(pattern)) {
      const normalized = lexSql(match[0])
        .code.replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const grant = GRANT.exec(normalized);
      if (!grant) continue;
      const roles = roleList(grant[2]);
      const open = roles.filter((role) => OPEN_ROLES.includes(role));
      const computed = roles.some((role) => /^%[si](?![a-z0-9_])/.test(role));
      if (open.length || computed)
        findings.push({
          rule: RULES.anonGrant,
          line: body.line + countNewlines(body.text.slice(0, match.index)),
          ...(open.length ? {} : { severity: 'warning' }),
          detail: open.length
            ? `literal body grant to ${open.join(', ')}`
            : 'WARNING: body grant has a computed grantee; review the generated SQL',
        });
    }
  }
  return findings;
}

function scanSql(sql, { definerRule }) {
  const { statements, comments, bodies } = parseStatements(sql);
  const findings = [];
  const definers = [];
  const revoked = new Map();

  for (const statement of statements) {
    const roles = openGrantees(statement.text);
    if (roles.length > 0 && !isAllowed(statement, comments, RULES.anonGrant)) {
      findings.push({
        rule: RULES.anonGrant,
        line: statement.startLine,
        detail: `grants to ${roles.join(', ')}`,
      });
    }

    const revoke = REVOKE_FUNCTION.exec(statement.text);
    if (revoke) {
      const fromRoles = roleList(revoke[3]);
      for (const target of splitTopLevel(revoke[2])) {
        const routine = readRoutine(target);
        if (!routine) continue;
        const types =
          routine.args === null ? null : signatureTypes(routine.args);
        const key = routineKey(routine.name, types);
        const entries = revoked.get(key) ?? [];
        entries.push({
          start: statement.start,
          kind: revoke[1],
          roles: fromRoles,
        });
        revoked.set(key, entries);
      }
    }

    const create = DEFINER.exec(statement.text);
    if (definerRule && create && /\bsecurity definer\b/.test(statement.text)) {
      const routine = readRoutine(create[2]);
      if (routine) {
        definers.push({
          statement,
          name: routine.name,
          kind: create[1],
          types: routine.args === null ? null : signatureTypes(routine.args),
        });
      }
    }
  }

  for (const definer of definers) {
    if (isAllowed(definer.statement, comments, RULES.definerPublic)) continue;
    const key = routineKey(definer.name, definer.types);
    const roles = new Set(
      [
        ...(revoked.get(key) ?? []),
        ...(key === definer.name ? [] : (revoked.get(definer.name) ?? [])),
      ]
        .filter(
          (entry) =>
            entry.start > definer.statement.start &&
            (entry.kind === definer.kind ||
              entry.kind === 'routine' ||
              definer.kind === 'routine')
        )
        .flatMap((entry) => entry.roles)
    );
    const missing = OPEN_ROLES.filter((role) => !roles.has(role));
    if (missing.length > 0) {
      findings.push({
        rule: RULES.definerPublic,
        line: definer.statement.startLine,
        detail: `creates SECURITY DEFINER ${definer.kind} ${key} without revoking EXECUTE from ${missing.join(', ')}`,
      });
    }
  }
  for (const body of bodies) {
    const statement = statements.find(
      (entry) => body.start >= entry.start && body.end <= entry.end
    );
    if (
      !statement ||
      !/^(?:do\b|create (?:or replace )?(?:function|procedure)\b)/.test(
        statement.text
      )
    )
      continue;
    if (isAllowed(statement, comments, RULES.anonGrant)) continue;
    findings.push(...scanBodyGrants(body));
  }
  return findings.sort((left, right) => left.line - right.line);
}

const GUIDANCE = {
  [RULES.anonGrant]:
    'Grant to authenticated or service_role instead, or add "-- allow-anon-grant: <reason>" on the same or preceding line.',
  [RULES.definerPublic]:
    'Add "revoke all on function <signature> from public, anon;" after its create/alter in the same file (use procedure for procedures), or "-- allow-definer-public: <reason>" on the same or preceding line.',
};

// --- Repository evaluation ----------------------------------------------

function listSqlFiles(rootDir = ROOT_DIR) {
  return [MIGRATIONS_DIR, ROLLBACKS_DIR].flatMap((directory) => {
    const absolute = path.join(rootDir, directory);
    if (!fs.existsSync(absolute)) return [];
    return fs
      .readdirSync(absolute)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => `${directory}/${name}`);
  });
}

function fileVersion(file) {
  return /^(\d{14})/.exec(path.posix.basename(file))?.[1] ?? null;
}

function evaluateSqlFiles({ files, readFile, cutoff = MIGRATION_CUTOFF }) {
  const violations = [];
  const legacy = [];
  const warnings = [];
  for (const file of files) {
    const definerRule = file.startsWith(`${MIGRATIONS_DIR}/`);
    if (!definerRule && !file.startsWith(`${ROLLBACKS_DIR}/`)) continue;
    const version = fileVersion(file);
    // Unversioned files cannot be shown to predate the rule.
    const enforced = version === null || version >= cutoff;
    for (const finding of scanSql(readFile(file), { definerRule })) {
      const entry = {
        ...finding,
        file,
        message: `${file}:${finding.line} ${finding.detail}. ${GUIDANCE[finding.rule]}`,
      };
      (finding.severity === 'warning'
        ? warnings
        : enforced
          ? violations
          : legacy
      ).push(entry);
    }
  }
  return { violations, legacy, warnings };
}

function checkRepository(rootDir = ROOT_DIR) {
  return evaluateSqlFiles({
    files: listSqlFiles(rootDir),
    readFile: (file) => fs.readFileSync(path.join(rootDir, file), 'utf8'),
  });
}

function formatLegacyReport(legacy, cutoff = MIGRATION_CUTOFF) {
  const lines = [
    `Legacy SQL grant findings in files before ${cutoff} (not enforced): ${legacy.length}`,
  ];
  for (const rule of Object.values(RULES)) {
    const findings = legacy.filter((finding) => finding.rule === rule);
    const files = new Set(findings.map((finding) => finding.file));
    lines.push(`  ${rule}: ${findings.length} in ${files.size} files`);
  }
  const perFile = new Map();
  for (const finding of legacy) {
    perFile.set(finding.file, (perFile.get(finding.file) ?? 0) + 1);
  }
  lines.push('By file:');
  for (const [file, count] of [...perFile].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )) {
    lines.push(`  ${String(count).padStart(5)}  ${file}`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const { violations, legacy, warnings } = checkRepository();
  for (const warning of warnings) console.warn(warning.message);
  if (process.argv.includes('--report')) {
    console.log(formatLegacyReport(legacy));
  } else {
    for (const violation of violations) console.error(violation.message);
    if (violations.length > 0) process.exit(1);
    console.log('SQL grant guard passed.');
  }
}

module.exports = {
  MIGRATION_CUTOFF,
  RULES,
  checkRepository,
  evaluateSqlFiles,
  formatLegacyReport,
  lexSql,
  scanSql,
};
