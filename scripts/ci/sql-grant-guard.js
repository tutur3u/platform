#!/usr/bin/env node

// Fails when a new migration or rollback grants privileges to PUBLIC or anon,
// or when a new migration creates a SECURITY DEFINER function without revoking
// EXECUTE from PUBLIC and anon after the creation (same file or a later
// migration; see sql-grant-acl.js for the frozen inherited-ACL allowlist and
// the same-file-only rule for newer migrations). Files before the cutoff are
// legacy; `--report` lists them for visibility without failing.
// Policy: apps/docs/reference/database/migrations-guide.mdx#sql-grant-guard

const fs = require('node:fs');
const path = require('node:path');
const {
  INHERITED_ACL_CUTOFF,
  OPEN_ROLES: DEFINER_ROLES,
  judgeDefinerAcl,
} = require('./sql-grant-acl');
const {
  readRoutine,
  roleList,
  routineKey,
  signatureTypes,
} = require('./sql-grant-identifiers');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const ROLLBACKS_DIR = 'apps/database/rollbacks';
// Files whose version prefix is below this predate the rule.
const MIGRATION_CUTOFF = '20261028000000';
const OPEN_ROLES = DEFINER_ROLES;
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

// --- Rules ---------------------------------------------------------------

const GRANT = /^(?:alter default privileges\s.*?)?\bgrant\s(.+?)\sto\s(.+)$/;
const CREATE_FUNCTION = /^create (?:or replace )?function\s(.+)$/;

function openGrantees(text) {
  if (!/^(?:grant|alter default privileges)\s/.test(text)) return [];
  const match = GRANT.exec(text);
  if (!match) return [];
  return roleList(match[2]).filter((role) => OPEN_ROLES.includes(role));
}

function scanSql(
  sql,
  {
    definerRule,
    file = null,
    priorStatements = [],
    laterStatements = [],
    sameFileOnly = false,
    onSatisfied = () => {},
  }
) {
  const { statements, comments } = parseStatements(sql);
  const findings = [];
  const definers = [];

  for (const statement of statements) {
    const roles = openGrantees(statement.text);
    if (roles.length > 0 && !isAllowed(statement, comments, RULES.anonGrant)) {
      findings.push({
        rule: RULES.anonGrant,
        line: statement.startLine,
        detail: `grants to ${roles.join(', ')}`,
      });
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

  const tagged = statements.map((statement) => ({ ...statement, file }));
  for (const definer of definers) {
    if (isAllowed(definer.statement, comments, RULES.definerPublic)) continue;
    const key = routineKey(definer.name, definer.types);
    const index = statements.indexOf(definer.statement);
    const verdict = judgeDefinerAcl({
      file,
      key,
      history: [...priorStatements, ...tagged.slice(0, index)],
      definer: tagged[index],
      tail: [
        ...tagged.slice(index + 1),
        ...(sameFileOnly ? [] : laterStatements),
      ],
    });
    if (verdict.missing.length === 0) {
      onSatisfied({
        line: definer.statement.startLine,
        signature: key,
        mode: verdict.mode,
        evidence: verdict.evidence,
        note: verdict.note,
      });
    } else {
      findings.push({
        rule: RULES.definerPublic,
        line: definer.statement.startLine,
        detail: `creates SECURITY DEFINER function ${key} without revoking EXECUTE from ${verdict.missing.join(', ')}`,
        hint: sameFileOnly
          ? `Migrations after ${INHERITED_ACL_CUTOFF} need the revoke in the same file, after the creation; later files and inherited ACLs do not count.`
          : '',
      });
    }
  }
  return findings.sort((left, right) => left.line - right.line);
}

const GUIDANCE = {
  [RULES.anonGrant]:
    'Grant to authenticated or service_role instead, or add "-- allow-anon-grant: <reason>" on the same or preceding line.',
  [RULES.definerPublic]:
    'Add "revoke all on function <signature> from public, anon;" after the creation in the same migration (later migrations count only up to the inherited-ACL cutoff), or "-- allow-definer-public: <reason>" on the same or preceding line.',
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
  const satisfied = [];
  const tagged = (file) =>
    parseStatements(readFile(file)).statements.map((statement) => ({
      ...statement,
      file,
    }));
  // Versioned forward migrations in apply order; only these carry ACL history.
  const ordered = files
    .filter(
      (file) =>
        file.startsWith(`${MIGRATIONS_DIR}/`) && fileVersion(file) !== null
    )
    .sort((left, right) => left.localeCompare(right));
  const statementsOf = new Map();
  const statementsIn = (file) => {
    if (!statementsOf.has(file)) statementsOf.set(file, tagged(file));
    return statementsOf.get(file);
  };
  for (const file of files) {
    const definerRule = file.startsWith(`${MIGRATIONS_DIR}/`);
    if (!definerRule && !file.startsWith(`${ROLLBACKS_DIR}/`)) continue;
    const version = fileVersion(file);
    // Unversioned files cannot be shown to predate the rule.
    const enforced = version === null || version >= cutoff;
    const position = ordered.indexOf(file);
    const withHistory = definerRule && enforced && position >= 0;
    for (const finding of scanSql(readFile(file), {
      definerRule,
      file,
      priorStatements: withHistory
        ? ordered.slice(0, position).flatMap(statementsIn)
        : [],
      laterStatements: withHistory
        ? ordered.slice(position + 1).flatMap(statementsIn)
        : [],
      sameFileOnly: version === null || version > INHERITED_ACL_CUTOFF,
      onSatisfied: (entry) => {
        if (enforced) satisfied.push({ ...entry, file });
      },
    })) {
      const entry = {
        ...finding,
        file,
        message:
          `${file}:${finding.line} ${finding.detail}. ${GUIDANCE[finding.rule]} ${finding.hint ?? ''}`.trim(),
      };
      (enforced ? violations : legacy).push(entry);
    }
  }
  return { violations, legacy, satisfied };
}

// Evidence worth printing: inherited passes, and passes that rest on a revoke
// in another migration. Same-file revokes are visible in the file itself.
function formatSatisfied(entry) {
  // Group roles by the revoke statement that evidences them.
  const bySource = new Map();
  for (const { role, file, line } of entry.evidence) {
    const source = `${file}:${line}`;
    bySource.set(source, [...(bySource.get(source) ?? []), role]);
  }
  const evidence = [...bySource]
    .map(([source, roles]) => `${roles.join(', ')} revoked at ${source}`)
    .join('; ');
  const subject = `${entry.file}:${entry.line} ${entry.signature}`;
  if (entry.mode === 'inherited-acl') {
    const note = entry.note ? `; ${entry.note}` : '';
    return `${subject} inherited ACL (frozen allowlist): ${evidence}${note}`;
  }
  if (entry.evidence.every((item) => item.file === entry.file)) return null;
  return `${subject} satisfied by a revoke outside this file: ${evidence}`;
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
  const { violations, legacy, satisfied } = checkRepository();
  for (const entry of satisfied) {
    const line = formatSatisfied(entry);
    if (line) console.log(line);
  }
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
  formatSatisfied,
  lexSql,
  scanSql,
};
