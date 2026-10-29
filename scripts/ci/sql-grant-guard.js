#!/usr/bin/env node

// Fails when a new migration or rollback grants privileges to PUBLIC or anon,
// or when a new migration creates a SECURITY DEFINER function without revoking
// EXECUTE from PUBLIC and anon in the same or a later migration. Files before the cutoff are
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
function lexSql(sql) {
  let code = '';
  let line = 1;
  let index = 0;
  const comments = [];
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
        emit(close < 0 ? sql.length : close + tag[0].length, false);
      } else {
        code += char;
        if (char === '\n') line++;
        index++;
      }
    }
  }
  return { code, comments };
}

function countNewlines(text) {
  return text.split('\n').length - 1;
}

// Splits lexed SQL into normalized (lowercase, single-spaced) statements.
function parseStatements(sql) {
  const { code, comments } = lexSql(sql);
  const statements = [];
  let line = 1;
  for (const part of code.split(';')) {
    const startLine = line + countNewlines(/^\s*/.exec(part)[0]);
    const body = part.trim();
    if (body) {
      statements.push({
        text: body.replace(/\s+/g, ' ').toLowerCase(),
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
const CREATE_FUNCTION = /^create (?:or replace )?function\s(.+)$/;

function openGrantees(text) {
  if (!/^(?:grant|alter default privileges)\s/.test(text)) return [];
  const match = GRANT.exec(text);
  if (!match) return [];
  return roleList(match[2]).filter((role) => OPEN_ROLES.includes(role));
}

function routineKey(name, types) {
  return types ? `${name}(${types.join(',')})` : name;
}

const REVOKE_EXECUTE =
  /^revoke\s(?:all(?: privileges)?|execute)\son (?:function|routine)s?\s(.+?)\sfrom\s(.+)$/;
const GRANT_EXECUTE =
  /^grant\s(?:all(?: privileges)?|execute)\son (?:function|routine)s?\s(.+?)\sto\s(.+)$/;
const DROP_FUNCTION = /^drop function\s(?:if exists\s)?(.+)$/;

function routineKeys(targets) {
  return splitTopLevel(targets).flatMap((target) => {
    const routine = readRoutine(target);
    return routine && routine.args !== null
      ? [routineKey(routine.name, signatureTypes(routine.args))]
      : [];
  });
}

function scanSql(sql, { definerRule, laterStatements = [] }) {
  const { statements, comments } = parseStatements(sql);
  const findings = [];
  const definers = [];
  const revoked = new Map();

  for (const [index, statement] of [
    ...statements,
    ...laterStatements,
  ].entries()) {
    const local = index < statements.length;
    const roles = openGrantees(statement.text);
    if (
      local &&
      roles.length > 0 &&
      !isAllowed(statement, comments, RULES.anonGrant)
    ) {
      findings.push({
        rule: RULES.anonGrant,
        line: statement.startLine,
        detail: `grants to ${roles.join(', ')}`,
      });
    }

    const revoke = REVOKE_EXECUTE.exec(statement.text);
    const grant = GRANT_EXECUTE.exec(statement.text);
    const drop = DROP_FUNCTION.exec(statement.text);
    if (drop) {
      for (const key of routineKeys(drop[1])) revoked.delete(key);
    } else if (revoke || grant) {
      const match = revoke ?? grant;
      for (const key of routineKeys(match[1])) {
        const rolePositions = revoked.get(key) ?? new Map();
        for (const role of roleList(match[2])) {
          if (revoke) rolePositions.set(role, index);
          else rolePositions.delete(role);
        }
        revoked.set(key, rolePositions);
      }
    }

    const create = CREATE_FUNCTION.exec(statement.text);
    if (
      local &&
      definerRule &&
      create &&
      /\bsecurity definer\b/.test(statement.text)
    ) {
      const routine = readRoutine(create[1]);
      if (routine && routine.args !== null) {
        definers.push({
          statement,
          index,
          name: routine.name,
          types: signatureTypes(routine.args),
        });
      }
    }
  }

  for (const definer of definers) {
    if (isAllowed(definer.statement, comments, RULES.definerPublic)) continue;
    const key = routineKey(definer.name, definer.types);
    const rolePositions = revoked.get(key);
    const missing = OPEN_ROLES.filter(
      (role) => (rolePositions?.get(role) ?? -1) <= definer.index
    );
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

const GUIDANCE = {
  [RULES.anonGrant]:
    'Grant to authenticated or service_role instead, or add "-- allow-anon-grant: <reason>" on the same or preceding line.',
  [RULES.definerPublic]:
    'Add "revoke all on function <signature> from public, anon;" in the same file or a later migration, or "-- allow-definer-public: <reason>" on the same or preceding line.',
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
  const sources = new Map(
    files
      .filter(
        (file) =>
          file.startsWith(`${MIGRATIONS_DIR}/`) ||
          file.startsWith(`${ROLLBACKS_DIR}/`)
      )
      .map((file) => [file, readFile(file)])
  );
  const migrations = [...sources]
    .filter(
      ([file]) =>
        file.startsWith(`${MIGRATIONS_DIR}/`) && fileVersion(file) !== null
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, sql]) => ({
      version: fileVersion(file),
      statements: parseStatements(sql).statements.filter(
        (statement) =>
          REVOKE_EXECUTE.test(statement.text) ||
          GRANT_EXECUTE.test(statement.text) ||
          DROP_FUNCTION.test(statement.text)
      ),
    }));

  for (const [file, sql] of sources) {
    const definerRule = file.startsWith(`${MIGRATIONS_DIR}/`);
    const version = fileVersion(file);
    // Unversioned files cannot be shown to predate the rule.
    const enforced = version === null || version >= cutoff;
    const laterStatements =
      definerRule && version !== null
        ? migrations
            .filter((migration) => migration.version > version)
            .flatMap((migration) => migration.statements)
        : [];
    for (const finding of scanSql(sql, { definerRule, laterStatements })) {
      const entry = {
        ...finding,
        file,
        message: `${file}:${finding.line} ${finding.detail}. ${GUIDANCE[finding.rule]}`,
      };
      (enforced ? violations : legacy).push(entry);
    }
  }
  return { violations, legacy };
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
  const { violations, legacy } = checkRepository();
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
