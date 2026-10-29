#!/usr/bin/env node

// Enforces SQL privilege and definer rules on every file outside the reviewed
// digest baseline. Post-cutoff legacy rules remain enforced even if a caller
// supplies a baseline entry. --report also lists all enforced findings for triage.
// Policy: apps/docs/reference/database/migrations-guide.mdx#sql-grant-guard

const fs = require('node:fs');
const {
  digest,
  resolveBase,
  loadBaseline,
} = require('./sql-grant-guard-repository');
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
function lexSql(sql) {
  let code = '';
  let line = 1;
  let index = 0;
  const comments = [];
  const bodies = [];
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
      comments.push({ line, text: sql.slice(index + 2, end) });
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
      emit(Math.min(cursor, sql.length), false);
    } else if (char === '"') {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] !== '"') cursor++;
        else if (sql[cursor + 1] === '"') cursor += 2;
        else {
          cursor++;
          break;
        }
      }
      emit(Math.min(cursor, sql.length), true);
    } else {
      const tag =
        char === '$' && !/[\w$]/.test(sql[index - 1] ?? '')
          ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
              sql.slice(index, index + 64)
            )
          : null;
      if (tag) {
        const close = sql.indexOf(tag[0], index + tag[0].length);
        bodies.push(
          sql.slice(index + tag[0].length, close < 0 ? sql.length : close)
        );
        emit(close < 0 ? sql.length : close + tag[0].length, false);
      } else {
        code += char;
        if (char === '\n') line++;
        index++;
      }
    }
  }
  return { code, comments, bodies };
}

function splitStatements(code) {
  const parts = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '"') {
      if (quoted && code[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (code[i] === ';' && !quoted) {
      parts.push(code.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(code.slice(start));
  return parts;
}
function foldSql(code) {
  return (code.match(/"(?:[^"]|"")*"|[^"\s]+|\s+/g) ?? [])
    .map((token) =>
      token.startsWith('"') ? token : token.replace(/\s+/g, ' ').toLowerCase()
    )
    .join('')
    .trim();
}
function countNewlines(text) {
  return text.split('\n').length - 1;
}

// Splits lexed SQL into normalized (lowercase, single-spaced) statements.
function parseStatements(sql) {
  const { code, comments } = lexSql(sql);
  const statements = [];
  let line = 1;
  for (const part of splitStatements(code)) {
    const startLine = line + countNewlines(/^\s*/.exec(part)[0]);
    const body = part.trim();
    if (body) {
      statements.push({
        text: foldSql(body),
        startLine,
        endLine: startLine + countNewlines(body),
      });
    }
    line += countNewlines(part);
  }
  return { statements, comments };
}

function isAllowed(statement, comments, rule) {
  const marker = new RegExp(`^\\s*${ALLOW_MARKERS[rule]}\\s*:\\s*\\S`, 'i');
  return comments.some(
    (comment) =>
      comment.line >= statement.startLine - 1 &&
      comment.line <= statement.endLine &&
      marker.test(comment.text)
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
  const parts = name.match(/"(?:[^"]|"")*"|[a-z_][\w$]*/g) ?? [];
  const names = parts.map((part) =>
    part.startsWith('"')
      ? part.slice(1, -1).replaceAll('""', '"')
      : part.toLowerCase()
  );
  return (names.length === 1 ? ['public', ...names] : names)
    .map((part) =>
      /^[a-z_][a-z0-9_$]*$/.test(part) ? part : JSON.stringify(part)
    )
    .join('.');
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
  timestamp: 'timestamp without time zone',
};

function normalizeType(type) {
  const plain = type
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[\s*\d*\s*\]/g, '[]')
    .replace(/^(?:public|pg_catalog)\./, '')
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
    let argument = raw
      .replace(/^(\S+)\s+(in|inout|out|variadic)\s+/, '$2 $1 ')
      .replace(/\s*(?:\bdefault\b|=).*$/, '')
      .trim();
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
  const name =
    /^\s*((?:"(?:[^"]|"")*"|[a-z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[a-z_][\w$]*))*)\s*/.exec(
      text
    );
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
        .replace(/^"([^"]*)"$/, '$1')
    );
}

// --- Rules ---------------------------------------------------------------

const GRANT = /^(?:alter default privileges\s.*?)?\bgrant\s(.+?)\sto\s(.+)$/;
const CREATE_FUNCTION = /^create (?:or replace )?(?:function|procedure)\s(.+)$/;
const REVOKE_FUNCTION =
  /^revoke\s.+?\son (?:function|routine|procedure)s?\s(.+?)\sfrom\s(.+)$/;

function openGrantees(text) {
  if (!/^(?:grant|alter default privileges)\s/.test(text)) return [];
  const match = GRANT.exec(text);
  if (!match) return [];
  return roleList(match[2]).filter((role) => OPEN_ROLES.includes(role));
}

function routineKey(name, types) {
  return types ? `${name}(${types.join(',')})` : name;
}

function scanSql(sql, { definerRule }) {
  const { statements, comments } = parseStatements(sql);
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
      const fromRoles = roleList(revoke[2]);
      for (const target of splitTopLevel(revoke[1])) {
        const routine = readRoutine(target);
        if (!routine) continue;
        const types =
          routine.args === null ? null : signatureTypes(routine.args);
        const key = routineKey(routine.name, types);
        const roleSet = revoked.get(key) ?? new Set();
        for (const role of fromRoles) roleSet.add(role);
        revoked.set(key, roleSet);
      }
    }

    const create = CREATE_FUNCTION.exec(statement.text);
    if (definerRule && create && /\bsecurity definer\b/.test(statement.text)) {
      const routine = readRoutine(create[1]);
      if (routine && routine.args !== null) {
        definers.push({
          statement,
          name: routine.name,
          types: signatureTypes(routine.args),
        });
      }
    }
  }

  for (const definer of definers) {
    if (isAllowed(definer.statement, comments, RULES.definerPublic)) continue;
    const key = routineKey(definer.name, definer.types);
    const roles = new Set([
      ...(revoked.get(key) ?? []),
      ...(revoked.get(definer.name) ?? []),
    ]);
    const missing = OPEN_ROLES.filter((role) => !roles.has(role));
    if (missing.length > 0) {
      findings.push({
        rule: RULES.definerPublic,
        line: definer.statement.startLine,
        detail: `creates SECURITY DEFINER function ${key} without revoking EXECUTE from ${missing.join(', ')}`,
      });
    }
  }
  return findings.sort((left, right) => left.line - right.line);
}

// Internal and trigger routines can explicitly declare that no grant is intended.
function scanExtensions(sql, { rollback = false } = {}) {
  const { statements, comments } = parseStatements(sql);
  const noGrant = comments.some(({ text }) =>
    /^\s*tuturuuu:\s*no-grant\s*\((?:internal|trigger)\)\s*$/.test(text)
  );
  const findings = [];
  const add = (rule, statement, detail) =>
    findings.push({ rule, line: statement.startLine, detail });
  if (lexSql(sql).bodies.some((body) => /\bexecute\b/i.test(lexSql(body).code)))
    findings.push({
      rule: 'dynamic-sql-review',
      line: 1,
      detail: 'dynamic EXECUTE in a routine body requires security review',
    });
  for (const [index, statement] of statements.entries()) {
    const text = statement.text;
    if (
      (text.match(/"(?:[^"]|"")*"/g) ?? []).some((token) =>
        /[;\s,()]/.test(token)
      )
    )
      add(
        'function-acl',
        statement,
        'complex quoted identifiers require explicit security review'
      );
    if (
      rollback &&
      (/^alter default privileges\b.*\bgrant\b/.test(text) ||
        (GRANT.test(text) &&
          (openGrantees(text).length ||
            /^grant\s+(?:all\b|[^;]*\b(?:truncate|maintain)\b)/.test(text))))
    ) {
      add(
        'rollback-safety',
        statement,
        'rollback restores unsafe grants or default privileges'
      );
    }
    if (/^do\b|^execute\b/.test(text))
      add(
        'dynamic-sql-review',
        statement,
        'dynamic SQL requires explicit security review'
      );
    if (
      /^alter (?:function|procedure|routine)\b/.test(text) &&
      /\b(?:security definer|set|reset)\b/.test(text)
    ) {
      add(
        'definer-search-path',
        statement,
        'ALTER routine security or configuration requires a complete reviewed CREATE definition'
      );
      if (/\bsecurity definer\b/.test(text))
        add(
          'function-acl',
          statement,
          'ALTER SECURITY DEFINER requires a complete reviewed CREATE and ACL block'
        );
    }
    if (
      /^grant\b/.test(text) &&
      (!/\bon\b/.test(text.replace(/"(?:[^"]|"")*"/g, 'identifier')) ||
        /\bwith grant option\b/.test(text))
    )
      add(
        'rollback-safety',
        statement,
        'role membership and grant options require explicit security review'
      );
    const create = CREATE_FUNCTION.exec(text);
    if (!create) continue;
    const routine = readRoutine(create[1]);
    if (!routine || routine.args === null) {
      add(
        'function-acl',
        statement,
        'cannot parse routine identity; explicit review required'
      );
      continue;
    }
    const key = routineKey(routine.name, signatureTypes(routine.args));
    const roles = new Set();
    let granted = false;
    let unsafeGrant = false;
    for (const later of statements.slice(index + 1)) {
      const revoke =
        /^revoke all(?: privileges)? on (?:function|routine|procedure)\s+(.+?) from (.+)$/.exec(
          later.text
        );
      const grant =
        /^grant (?:execute|all(?: privileges)?) on (?:function|routine|procedure)\s+(.+?) to (.+)$/.exec(
          later.text
        );
      const match = revoke || grant;
      if (!match) continue;
      for (const target of splitTopLevel(match[1])) {
        const acl = readRoutine(target);
        if (
          !acl ||
          acl.args === null ||
          routineKey(acl.name, signatureTypes(acl.args)) !== key
        )
          continue;
        if (revoke) for (const role of roleList(match[2])) roles.add(role);
        else {
          const grantees = roleList(match[2]);
          granted ||= grantees.includes('service_role');
          unsafeGrant ||= grantees.some((role) =>
            ['public', 'anon', 'authenticated'].includes(role)
          );
        }
      }
    }
    if (
      !['public', 'anon', 'authenticated'].every((role) => roles.has(role)) ||
      unsafeGrant ||
      (!granted && !noGrant)
    ) {
      add(
        'function-acl',
        statement,
        `${key} requires subsequent same-file REVOKE ALL from PUBLIC, anon, authenticated and a service_role grant or no-grant (internal|trigger) marker`
      );
    }
    if (/\bsecurity definer\b/.test(text)) {
      const settings = [
        ...text.matchAll(
          /\bset (?:"search_path"|search_path)\s*(?:=|to)\s*(.*?)(?=\s+(?:as|language|set|security|immutable|stable|volatile|parallel|cost|rows|support|begin|return|strict|leakproof|not|called|returns|window|transform|external)\b|$)/g
        ),
      ];
      const setting =
        settings.length === 1 &&
        [...text.matchAll(/\bset (?:"search_path"|search_path)(?=\s|=)/gi)]
          .length === 1
          ? settings[0]
          : null;
      const schemas =
        setting?.[1]
          .split(',')
          .map((name) =>
            /^(?:[a-z_][a-z0-9_]*|"[a-z_][a-z0-9_]*")$/.test(name.trim())
              ? name.trim().replaceAll('"', '')
              : ''
          ) ?? [];
      if (
        schemas[0] !== 'pg_catalog' ||
        schemas.at(-1) !== 'pg_temp' ||
        schemas.some(
          (name, i) =>
            !name ||
            name === '$user' ||
            /^pg_(?:toast_)?temp_/.test(name) ||
            (name === 'pg_temp' && i !== schemas.length - 1)
        )
      ) {
        add(
          'definer-search-path',
          statement,
          `${key} requires pg_catalog first, pg_temp last and no empty or user-dependent schema`
        );
      }
    }
  }
  return findings;
}

function changedSqlFiles(rootDir, env = process.env) {
  // Resolve history even on main; enforcement itself covers every non-baselined file.
  return resolveBase(rootDir, env);
}

const GUIDANCE = {
  [RULES.anonGrant]:
    'Grant to authenticated or service_role instead, or add "-- allow-anon-grant: <reason>" on the same or preceding line.',
  [RULES.definerPublic]:
    'Add "revoke all on function <signature> from public, anon;" in the same file, or "-- allow-definer-public: <reason>" on the same or preceding line.',
};

// --- Repository evaluation ----------------------------------------------

function listSqlFiles(rootDir = ROOT_DIR) {
  return [
    MIGRATIONS_DIR,
    ROLLBACKS_DIR,
    'apps/database/supabase/schemas',
  ].flatMap((directory) => {
    const absolute = path.join(rootDir, directory);
    if (!fs.existsSync(absolute)) return [];
    return fs
      .readdirSync(absolute, { recursive: true })
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => `${directory}/${name}`);
  });
}

function fileVersion(file) {
  return /^(\d{14})/.exec(path.posix.basename(file))?.[1] ?? null;
}

function evaluateSqlFiles({
  files,
  readFile,
  cutoff = MIGRATION_CUTOFF,
  baseline = {},
}) {
  const violations = [];
  const legacy = [];
  for (const file of files) {
    const definerRule = file.startsWith(`${MIGRATIONS_DIR}/`);
    const rollback = file.startsWith(`${ROLLBACKS_DIR}/`);
    const schema = file.startsWith('apps/database/supabase/schemas/');
    if (!definerRule && !rollback && !schema) continue;
    const version = fileVersion(file);
    // Unversioned files cannot be shown to predate the rule.
    const enforced = version === null || version >= cutoff;
    const sql = readFile(file);
    const findings = scanSql(sql, { definerRule });
    const exempt = baseline[file] === digest(sql);
    if (!exempt) {
      findings.push(...scanExtensions(sql, { rollback }));
      if (rollback) {
        const name = path.posix.basename(file);
        const stem = name.replace(
          /\.(?:incident-rollback|rollback|containment)\.sql$/,
          '.sql'
        );
        if (stem === name || !files.includes(`${MIGRATIONS_DIR}/${stem}`)) {
          findings.push({
            rule: 'rollback-name',
            line: 1,
            detail:
              'rollback filename must match a migration and use an approved rollback suffix',
          });
        }
      }
    }
    for (const finding of findings) {
      const entry = {
        ...finding,
        file,
        message: `${file}:${finding.line} ${finding.detail}. ${GUIDANCE[finding.rule] ?? 'See the SQL grant guard documentation.'}`,
      };
      (!exempt || enforced ? violations : legacy).push(entry);
    }
  }
  return { violations, legacy };
}

function checkRepository(rootDir = ROOT_DIR, env = process.env) {
  const base = changedSqlFiles(rootDir, env);
  return evaluateSqlFiles({
    files: listSqlFiles(rootDir),
    baseline: loadBaseline(rootDir, base),
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
  const { violations, legacy } = checkRepository();
  if (process.argv.includes('--report')) {
    console.log(formatLegacyReport(legacy));
    console.log(`Non-baselined SQL findings for triage: ${violations.length}`);
    for (const violation of violations) console.log(violation.message);
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
  scanExtensions,
  parseStatements,
  changedSqlFiles,
};
