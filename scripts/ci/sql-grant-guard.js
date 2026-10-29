#!/usr/bin/env node

// Enforces every diagnostic outside the reviewed historical-debt baseline.
// Changed file bytes and stale baseline entries fail closed; the baseline shrinks.
// Policy: apps/docs/reference/database/migrations-guide.mdx#declarative-grant-guard-p2-2

const fs = require('node:fs');
const {
  resolveBase,
  baselineReference,
} = require('./sql-grant-guard-repository');
const {
  evaluateSqlFiles,
  loadBaseline,
} = require('./sql-grant-guard-baseline');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const ROLLBACKS_DIR = 'apps/database/rollbacks';
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
const {
  lexSql,
  parseStatements,
  splitStatements,
} = require('./sql-grant-guard-lexer');

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
  if (depth !== 0 || index >= rest.length) return null;
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
    const grantReview =
      /\bon (?:function|procedure|routine)s?\b/.test(statement.text) &&
      routineGrantFindings(statement, comments, true).length === 0;
    if (
      roles.length > 0 &&
      !grantReview &&
      !isAllowed(statement, comments, RULES.anonGrant)
    ) {
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

function reviewedFunctionGrant(statement, comments, key, grantees) {
  return comments.some(({ line, text }) => {
    if (line < statement.startLine - 1 || line > statement.endLine)
      return false;
    const marker =
      /^\s*tuturuuu:\s*reviewed\(function-grant\):\s*(.+?)\s+(anon-required\s+)?review=(\S+)\s*$/.exec(
        text
      );
    return (
      marker &&
      marker[1] === key &&
      (!grantees.some((role) => ['anon', 'public'].includes(role)) ||
        Boolean(marker[2]))
    );
  });
}
function routineGrantFindings(statement, comments, reviewedExceptions) {
  const text = statement.text;
  const grant = GRANT.exec(text);
  if (!grant) return [];
  const grantees = roleList(grant[2]);
  const clients = grantees.some((role) =>
    ['public', 'anon', 'authenticated'].includes(role)
  );
  const fail = (detail) => [
    { rule: 'function-acl', line: statement.startLine, detail },
  ];
  if (
    clients &&
    (/^alter default privileges\b/.test(text) ||
      /\bon all .+? in schema\b/.test(text))
  )
    return fail(
      'broad schema and default privilege grants to PUBLIC, anon or authenticated are forbidden'
    );
  const targets = /\bon (?:function|procedure|routine)s?\s+(.+)$/.exec(
    grant[1]
  );
  if (!targets) return [];
  for (const target of splitTopLevel(targets[1])) {
    const routine = readRoutine(target);
    if (!routine || routine.args === null || routine.rest.trim())
      return fail('routine grants require an explicit parseable argument list');
    const key = routineKey(routine.name, signatureTypes(routine.args));
    if (
      clients &&
      !(
        reviewedExceptions &&
        reviewedFunctionGrant(statement, comments, key, grantees)
      )
    )
      return fail(
        `${key} client grant requires a same-statement signature review marker; anon/PUBLIC also require anon-required`
      );
  }
  return [];
}

// Internal and trigger routines can explicitly declare that no grant is intended.
function scanExtensions(
  sql,
  { rollback = false, reviewedExceptions = true } = {}
) {
  const { statements, comments } = parseStatements(sql);
  const noGrant = comments.some(({ text }) =>
    /^\s*tuturuuu:\s*no-grant\s*\((?:internal|trigger)\)\s*$/.test(text)
  );
  const findings = [];
  const reviewed = (rule, statement) =>
    reviewedExceptions &&
    comments.some(
      ({ line, text }) =>
        line >= statement.startLine - 1 &&
        line <= statement.endLine &&
        new RegExp(`^\\s*tuturuuu:\\s*reviewed\\(${rule}\\):\\s*\\S.*$`).test(
          text
        )
    );
  const add = (rule, statement, detail) => {
    if (
      rule === 'dynamic-sql-review' &&
      /^(?:do|execute)\b/.test(statement.text) &&
      reviewed(rule, statement)
    )
      return;
    findings.push({ rule, line: statement.startLine, detail });
  };
  if (/\bset\s+u&"/i.test(lexSql(sql).code))
    findings.push({
      rule: 'function-acl',
      line: 1,
      detail: 'Unicode escaped identifiers require explicit security review',
    });
  const lexed = lexSql(sql);
  for (const configuration of lexed.configurations) {
    findings.push({
      rule:
        configuration.name === 'search_path'
          ? 'definer-search-path'
          : 'function-acl',
      line: configuration.line,
      detail:
        'set_config of search_path or standard_conforming_strings is forbidden',
    });
  }
  if (
    /\bset\s+(?:(?:local|session)\s+)?(?:"standard_conforming_strings"|standard_conforming_strings)\s*(?:=|to\b|from\b)/i.test(
      lexed.code.replace(/\bset(?=")/gi, 'set ')
    )
  )
    findings.push({
      rule: 'function-acl',
      line: 1,
      detail: 'setting standard_conforming_strings is forbidden',
    });

  lexed.bodies.forEach((body, index) => {
    const line = lexed.bodyLines[index];
    const owner = statements.find(
      (s) => s.startLine <= line && s.endLine >= line
    );
    if (
      /\bexecute\b/i.test(lexSql(body).code) &&
      !(owner && reviewed('dynamic-sql-review', owner))
    )
      findings.push({
        rule: 'dynamic-sql-review',
        line,
        detail: 'dynamic EXECUTE in a routine body requires security review',
      });
  });
  for (const [index, statement] of statements.entries()) {
    const text = statement.text;
    if (
      /^(?:create (?:or replace )?(?:function|procedure)|alter (?:function|procedure|routine)|grant|revoke|set)\b/.test(
        text
      ) &&
      (text.match(/"(?:[^"]|"")*"/g) ?? []).some((token) =>
        /[;\s,()]/.test(token)
      ) &&
      !reviewed('quoted-identifier-review', statement)
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
      /\b(?:security definer|set|reset|owner to)\b/.test(text) &&
      !reviewed('alter-routine-review', statement)
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
    findings.push(
      ...routineGrantFindings(statement, comments, reviewedExceptions)
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
          granted ||=
            grantees.includes('service_role') ||
            (reviewedExceptions &&
              reviewedFunctionGrant(later, comments, key, grantees));
          unsafeGrant ||=
            grantees.some((role) =>
              ['public', 'anon', 'authenticated'].includes(role)
            ) &&
            !(
              reviewedExceptions &&
              reviewedFunctionGrant(later, comments, key, grantees)
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
        `${key} requires subsequent same-file REVOKE ALL from PUBLIC, anon, authenticated and a service_role grant, signature-reviewed client grant or no-grant (internal|trigger) marker`
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

function checkRepository(rootDir = ROOT_DIR, env = process.env) {
  const base = changedSqlFiles(rootDir, env);
  return evaluateSqlFiles({
    files: listSqlFiles(rootDir),
    baseline: loadBaseline(rootDir, baselineReference(rootDir, base, env)),
    readFile: (file) => fs.readFileSync(path.join(rootDir, file), 'utf8'),
  });
}

function formatLegacyReport(legacy) {
  const lines = [
    `Historical SQL diagnostic debt (not safe; explicitly baselined): ${legacy.length}`,
  ];
  for (const rule of [
    ...new Set([
      ...Object.values(RULES),
      ...legacy.map((finding) => finding.rule),
    ]),
  ]) {
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

module.exports = {
  RULES,
  checkRepository,
  evaluateSqlFiles,
  formatLegacyReport,
  lexSql,
  scanSql,
  splitStatements,
  listSqlFiles,
  scanExtensions,
  parseStatements,
  changedSqlFiles,
};

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
