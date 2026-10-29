#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  statements,
  tokens,
  values,
  identity,
  definitions,
} = require('./security-sql');

const {
  assertShrinkingBlocks,
  readReviewedFile,
  verifiedFindingMatches,
  reviewedBlockMatches,
} = require('./security-definer-blocks');

const MIGRATIONS = 'apps/database/supabase/migrations/';
const BASELINE = 'scripts/ci/security-definer-baseline.json';
const { inheritedFindings } = require('./security-definer-roles');
const {
  FROZEN_DEFINERS,
  FROZEN_DEFINERS_CUTOFF,
} = require('./sql-grant-frozen-definers');
const { evaluateSqlFiles } = require('./sql-grant-end-state-guard');
const { REVIEWED_EXCEPTIONS } = require('./sql-grant-reviewed-exceptions');
const {
  readRoutine,
  routineKey,
  signatureTypes,
} = require('./sql-grant-identifiers');

function unsafeGuards(body) {
  const code = values(tokens(body).filter((t) => t.kind === 'word')).replace(
    / :: (?:[\w]+ \. )?[\w]+(?: \[ \])?/g,
    ''
  );
  // A NULL check elsewhere in the function cannot protect this comparison.
  // Accept only a whole rejecting condition starting with the NULL disjunct.
  const conditions = [
    ...code.matchAll(/\b(?:if|elsif)\s+([\s\S]*?)\s+then\b/g),
  ];
  const unsafe =
    /auth \. uid \( \)(?: \))* (?:<>|!=)|(?:<>|!=) (?:\( )*(?:select )?auth \. uid \( \)/g;
  const unsafeMatches = [...code.matchAll(unsafe)];
  return unsafeMatches.some(
    (match) =>
      !conditions.some((condition) => {
        const start = condition.index;
        if (match.index < start || match.index >= start + condition[0].length)
          return false;
        const expression = condition[1];
        // Deliberately conservative: use IS DISTINCT FROM for complex expressions.
        return /^(?:\( )*auth \. uid \( \) is null or (?:\( )*auth \. uid \( \) (?:<>|!=) [\w. ]+(?: \))*$/.test(
          expression
        );
      })
  );
}

const REVIEW_RULES = new Set([
  'unsupported-execute-acl',
  'dynamic-execute-acl',
  'unsafe-default-execute',
]);
const TYPE_ALIASES = new Map([
  ['integer', 'int4'],
  ['int', 'int4'],
  ['smallint', 'int2'],
  ['bigint', 'int8'],
  ['boolean', 'bool'],
  ['character varying', 'varchar'],
  ['character', 'bpchar'],
  ['char', 'bpchar'],
  ['decimal', 'numeric'],
  ['dec', 'numeric'],
  ['double precision', 'float8'],
  ['real', 'float4'],
  ['timestamp with time zone', 'timestamptz'],
  ['timestamp without time zone', 'timestamp'],
  ['time with time zone', 'timetz'],
  ['time without time zone', 'time'],
  ['bit varying', 'varbit'],
]);
const BUILTIN_TYPES = new Set(
  (
    'uuid text bool int2 int4 int8 varchar bpchar numeric float4 float8 timestamp ' +
    'timestamptz time timetz bit varbit date interval bytea json jsonb record ' +
    'anyelement anyarray trigger void oid name money inet cidr macaddr tsvector tsquery'
  ).split(' ')
);

function keyword(token, value) {
  return token?.kind === 'word' && !token.quoted && token.value === value;
}

function splitList(ts) {
  const groups = [];
  let depth = 0;
  let group = [];
  for (const token of ts) {
    if (keyword(token, '(') || keyword(token, '[')) depth++;
    if (keyword(token, ')') || keyword(token, ']')) depth--;
    if (keyword(token, ',') && depth === 0) {
      groups.push(group);
      group = [];
    } else group.push(token);
  }
  if (group.length) groups.push(group);
  return groups;
}

function argumentType(ts) {
  let parts = [...ts];
  if (keyword(parts[0], 'out')) return null;
  if (['in', 'inout', 'variadic'].some((v) => keyword(parts[0], v)))
    parts.shift();
  const end = parts.findIndex((t) => keyword(t, 'default') || keyword(t, '='));
  if (end >= 0) parts = parts.slice(0, end);
  const canonical = (input) => {
    const array = input.some((t) => keyword(t, '[')) ? '[]' : '';
    const names = input.filter((t) => !keyword(t, '[') && !keyword(t, ']'));
    if (
      names.length === 3 &&
      keyword(names[1], '.') &&
      names[0].value !== 'pg_catalog'
    )
      return {
        key:
          'qualified:' +
          JSON.stringify([names[0].value, names[2].value]) +
          array,
        ambiguous: false,
      };
    if (
      input.some(
        (t) =>
          t.quoted && !BUILTIN_TYPES.has(t.value) && t.value !== 'pg_catalog'
      )
    )
      return null;
    let key = values(input).replace(/^pg_catalog \. /, '');
    key = key.replace(/(?: \[ \])+$/, '').replace(/ \( [^)]* \)/g, '');
    // FLOAT's precision changes its storage type, so it remains ambiguous.
    key = TYPE_ALIASES.get(key) ?? key;
    return BUILTIN_TYPES.has(key)
      ? { key: key + array, ambiguous: false }
      : null;
  };
  return (
    canonical(parts) ??
    (parts.length > 1 && !keyword(parts[1], '.')
      ? canonical(parts.slice(1))
      : null) ?? { key: values(parts), ambiguous: true }
  );
}

function routineTarget(ts) {
  let i = 1;
  const names = [ts[0]?.value];
  while (keyword(ts[i], '.')) {
    names.push(ts[i + 1]?.value);
    i += 2;
  }
  if (!names[0]) throw new Error('Missing routine name');
  let args = null;
  if (keyword(ts[i], '(')) {
    const id = identity(ts, 0);
    if (id.end !== ts.length) throw new Error('Unsupported routine target');
    args = splitList(ts.slice(i + 1, -1))
      .map(argumentType)
      .filter(Boolean);
  } else if (i !== ts.length) throw new Error('Unsupported routine target');
  return {
    name: names.length === 1 ? 'public.' + names[0] : names.join('.'),
    base: names.at(-1),
    schema: names.length === 1 ? 'public' : names.slice(0, -1).join('.'),
    parts: names.length === 1 ? ['public', ...names] : names,
    qualified: names.length > 1,
    args,
  };
}

function catalogEntry(fn) {
  const start =
    fn.tokens.findIndex((t) => ['function', 'procedure'].includes(t.value)) + 1;
  const end = identity(fn.tokens, start, true).end;
  return { ...fn, target: routineTarget(fn.tokens.slice(start, end)) };
}

function catalogKey(fn) {
  return JSON.stringify({ parts: fn.target.parts, args: fn.target.args });
}

function recipients(ts) {
  const end = ts.findIndex((t) =>
    ['with', 'granted', 'cascade', 'restrict'].some((v) => keyword(t, v))
  );
  return ts
    .slice(0, end < 0 ? ts.length : end)
    .filter((t) => ![',', 'group'].some((v) => keyword(t, v)))
    .map((t) => t.value);
}

function parseAcl(ts) {
  const action = ts[0]?.value;
  if (!['grant', 'revoke'].includes(action)) return null;
  const on = ts.findIndex((t) => keyword(t, 'on'));
  if (
    on < 0 ||
    !ts.slice(1, on).some((t) => ['all', 'execute'].includes(t.value))
  )
    return null;
  const kind = ts[on + 1]?.value;
  if (!['function', 'procedure', 'routine', 'all'].includes(kind)) return null;
  if (
    kind === 'all' &&
    !['functions', 'procedures', 'routines'].includes(ts[on + 2]?.value)
  )
    return null;
  let depth = 0;
  const direction = ts.findIndex((t, i) => {
    if (keyword(t, '(')) depth++;
    if (keyword(t, ')')) depth--;
    return (
      i > on && depth === 0 && keyword(t, action === 'grant' ? 'to' : 'from')
    );
  });
  if (direction < 0) throw new Error('Missing ACL recipients');
  // Revoking the option to delegate does not revoke EXECUTE itself.
  if (action === 'revoke' && ts[1]?.value === 'grant') return null;
  const roles = recipients(ts.slice(direction + 1));
  if (kind === 'all') {
    if (ts[on + 3]?.value !== 'in' || ts[on + 4]?.value !== 'schema')
      throw new Error('Unsupported bulk ACL');
    const schemas = splitList(ts.slice(on + 5, direction)).map((group) => {
      if (group.length !== 1) throw new Error('Unsupported ACL schema');
      return group[0].value;
    });
    if (!schemas.length) throw new Error('Missing ACL schema');
    return { action, roles, schemas };
  }
  const targets = splitList(ts.slice(on + 2, direction)).map(routineTarget);
  if (!targets.length) throw new Error('Missing ACL target');
  return { action, roles, targets };
}

function targetMatches(target, fn, action) {
  const known = fn.target;
  if (
    target.qualified
      ? JSON.stringify(target.parts) !== JSON.stringify(known.parts)
      : target.base !== known.base
  )
    return false;
  // An unqualified REVOKE may resolve to a different schema via search_path.
  if (action === 'revoke' && !target.qualified) return false;
  if (target.args === null) return action === 'grant';
  if (target.args.length !== known.args.length) return false;
  const ambiguous = [...target.args, ...known.args].some((a) => a.ambiguous);
  if (ambiguous) return action === 'grant';
  return target.args.every((a, i) => a.key === known.args[i].key);
}

function aclStatements(parsed, fn) {
  return parsed
    .filter((acl) =>
      acl.schemas
        ? acl.schemas.includes(fn.target.schema)
        : acl.targets.some((target) => targetMatches(target, fn, acl.action))
    )
    .map(({ action, roles }) => ({ action, roles }));
}

function reviewFinding(ts, rule, sql) {
  return {
    function: '<migration>',
    signature: '<' + rule + '>',
    rule,
    message: 'manual review required: ' + rule,
    ...(sql === undefined
      ? {}
      : {
          line: sql.slice(0, ts[0].start).split('\n').length,
          blockDigest: crypto
            .createHash('sha256')
            .update(sql.slice(ts[0].start, ts.at(-1).end))
            .digest('hex'),
        }),
    digest: crypto
      .createHash('sha256')
      .update(JSON.stringify(ts.map(({ value, kind }) => [kind, value])))
      .digest('hex'),
  };
}

function opaqueFindings(ts, sql) {
  const code = values(ts.filter((t) => t.kind === 'word'));
  const findings = [];
  if (/^alter default privileges\b/.test(code)) {
    const grant = ts.findIndex(
      (t, i) =>
        t.value === 'grant' && ['all', 'execute'].includes(ts[i + 1]?.value)
    );
    const on = ts.findIndex((t, i) => i > grant && t.value === 'on');
    const to = ts.findIndex((t, i) => i > on && t.value === 'to');
    if (
      grant >= 0 &&
      ['functions', 'routines'].includes(ts[on + 1]?.value) &&
      recipients(ts.slice(to + 1)).some((role) =>
        ['anon', 'public'].includes(role)
      )
    )
      findings.push(reviewFinding(ts, 'unsafe-default-execute', sql));
  }
  if (!/^(?:do\b|create (?:or replace )?(?:function|procedure)\b)/.test(code))
    return findings;
  const start =
    ts[0]?.value === 'do'
      ? 0
      : identity(
          ts,
          ts.findIndex((t) =>
            ['function', 'procedure'].some((v) => keyword(t, v))
          ) + 1,
          true
        ).end;
  const options = ts.slice(start);
  const as = options.findIndex((t) => keyword(t, 'as'));
  const bodies = ts[0]?.value === 'do' ? options : options.slice(as + 1);
  for (const body of bodies.filter((t) =>
    ['body', 'string'].includes(t.kind)
  )) {
    const bodyTokens = tokens(body.value);
    const dynamic = bodyTokens.some(
      (t, i) =>
        keyword(t, 'execute') &&
        bodyTokens[i + 1]?.value !== 'on' &&
        !['grant', 'revoke'].includes(bodyTokens[i - 1]?.value)
    );
    const mutation =
      /\b(?:grant|revoke)\b|\balter\s+default\s+privileges\b/i.test(body.value);
    const inline = bodyTokens.some((t) =>
      ['grant', 'revoke'].some((v) => keyword(t, v))
    );
    const unresolved = bodyTokens.some((t, i) => {
      if (
        !keyword(t, 'execute') ||
        keyword(bodyTokens[i + 1], 'on') ||
        ['grant', 'revoke'].some((v) => keyword(bodyTokens[i - 1], v))
      )
        return false;
      const literal = bodyTokens[i + 1];
      return (
        !['string', 'body'].includes(literal?.kind) ||
        ![';', 'into', 'using'].some((v) => keyword(bodyTokens[i + 2], v))
      );
    });
    if ((dynamic && mutation) || unresolved || inline) {
      findings.push(reviewFinding(ts, 'dynamic-execute-acl', sql));
      break;
    }
  }
  return findings;
}

function lintMigration(sql, catalog = []) {
  const current = definitions(sql).map(catalogEntry);
  const parsed = statements(sql);
  const defined = new Set(current.map(catalogKey));
  const acl = [];
  const opaque = parsed.flatMap((ts) => opaqueFindings(ts, sql));
  for (const ts of parsed) {
    try {
      const entry = parseAcl(ts);
      if (entry) acl.push(entry);
    } catch {
      opaque.push(reviewFinding(ts, 'unsupported-execute-acl'));
    }
  }
  const altered = statements(sql).flatMap((ts) => {
    if (
      !/^alter (?:function|procedure) /.test(values(ts)) ||
      !/\bsecurity definer\b/.test(values(ts))
    )
      return [];
    const id = identity(ts, 2);
    return [
      {
        function: id.name,
        signature: id.signature,
        rule: 'definer-alter-needs-definition',
        line: sql.slice(0, ts[0].start).split('\n').length,
        digest: crypto.createHash('sha256').update(values(ts)).digest('hex'),
      },
    ];
  });
  return [
    ...altered,
    ...opaque,
    ...current.flatMap((fn) => {
      const findings = [];
      const matchedAcl = aclStatements(acl, fn);
      const digest = crypto
        .createHash('sha256')
        .update(fn.digest + JSON.stringify(matchedAcl))
        .digest('hex');
      const add = (rule) =>
        findings.push({
          function: fn.name,
          signature: fn.signature,
          rule,
          line: sql.slice(0, fn.tokens[0].start).split('\n').length,
          digest,
        });
      if (
        !fn.tokens.some(
          (token, index, ts) =>
            keyword(token, 'set') &&
            keyword(ts[index + 1], 'search_path') &&
            (keyword(ts[index + 2], '=') || keyword(ts[index + 2], 'to')) &&
            ['word', 'string'].includes(ts[index + 3]?.kind)
        )
      )
        add('missing-search-path');
      const revoked = new Set();
      const granted = new Set();
      for (const statement of matchedAcl) {
        for (const role of statement.roles) {
          if (statement.action === 'revoke') {
            revoked.add(role);
            granted.delete(role);
          } else {
            granted.add(role);
            revoked.delete(role);
          }
        }
      }
      const explicitList = matchedAcl.some(
        (s) => s.action === 'grant' && s.roles.length > 0
      );
      if (
        !revoked.has('public') ||
        granted.has('public') ||
        granted.has('anon') ||
        (!revoked.has('anon') && !explicitList)
      )
        add('public-execute');
      if (unsafeGuards(fn.body)) add('null-unsafe-auth-guard');
      return findings;
    }),
    ...[...catalog]
      .filter((fn) => !defined.has(catalogKey(fn)))
      .flatMap((fn) => {
        const matchedAcl = aclStatements(acl, fn);
        const granted = new Set();
        for (const statement of matchedAcl) {
          for (const role of statement.roles) {
            if (statement.action === 'grant') granted.add(role);
            else granted.delete(role);
          }
        }
        if (!granted.has('public') && !granted.has('anon')) return [];
        return [
          {
            function: fn.name,
            signature: fn.signature,
            rule: 'public-execute',
            line: sql
              .slice(
                0,
                parsed.find((ts) => {
                  try {
                    const entry = parseAcl(ts);
                    return (
                      entry?.action === 'grant' &&
                      aclStatements([entry], fn).length
                    );
                  } catch {
                    return false;
                  }
                })?.[0]?.start ?? 0
              )
              .split('\n').length,
            digest: crypto
              .createHash('sha256')
              .update(fn.digest + JSON.stringify(matchedAcl))
              .digest('hex'),
          },
        ];
      }),
  ];
}

function checkRepository({
  root = process.cwd(),
  baseline,
  files,
  reviewedBlocks,
  historicalBlocks,
  verifiedFindings,
} = {}) {
  const verified =
    verifiedFindings ?? require('./security-definer-verified-findings.json');
  const historical =
    historicalBlocks ?? require('./security-definer-historical-blocks.json');
  const blocks =
    reviewedBlocks ?? require('./security-definer-reviewed-blocks.json');
  const accepted =
    baseline ??
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'security-definer-baseline.json'),
        'utf8'
      )
    );
  const paths =
    files ??
    execFileSync('git', ['ls-files', '--', MIGRATIONS + '*.sql'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  // Definers the SQL grant guard already accepts: frozen inherited ACLs and
  // its source-bound reviewed exceptions (one mechanism per finding; never
  // duplicate those entries in security-definer-verified-findings.json).
  const inherited = new Set();
  if (
    paths.some(
      (file) =>
        FROZEN_DEFINERS.some(
          (entry) => entry.file === path.posix.basename(file)
        ) || REVIEWED_EXCEPTIONS.some((entry) => entry.file === file)
    )
  ) {
    const { satisfied } = evaluateSqlFiles({
      files: paths,
      readFile: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    });
    for (const entry of satisfied) {
      if (
        entry.mode === 'reviewed-exception' ||
        (entry.mode === 'inherited-acl' &&
          path.posix.basename(entry.file).slice(0, 14) <=
            FROZEN_DEFINERS_CUTOFF)
      )
        inherited.add(entry.file + ':' + entry.signature);
    }
  }
  const findings = [];
  const catalog = new Map();
  const roleState = {
    members: new Map(),
    grants: new Map(),
    exposed: new Set(),
  };
  for (const file of [...paths].sort()) {
    const sql = fs.readFileSync(path.join(root, file), 'utf8');
    const sourceDigest = crypto.createHash('sha256').update(sql).digest('hex');
    const functions = new Map(catalog);
    for (const fn of definitions(sql).map(catalogEntry))
      functions.set(catalogKey(fn), fn);
    const roleFindings = inheritedFindings(
      statements(sql),
      [...functions.values()],
      roleState,
      { parseAcl, matches: targetMatches, key: catalogKey }
    );
    for (const finding of [
      ...lintMigration(sql, catalog.values()),
      ...roleFindings,
    ]) {
      if (
        verified.some((entry) =>
          verifiedFindingMatches(entry, file, finding, sourceDigest)
        )
      )
        continue;
      if (
        finding.rule === 'dynamic-execute-acl' &&
        (historical.some(
          (entry) =>
            entry.file === file && entry.blockDigest === finding.blockDigest
        ) ||
          blocks.some((entry) =>
            reviewedBlockMatches(entry, file, finding, sql)
          ))
      )
        continue;
      const routine =
        finding.rule === 'public-execute'
          ? readRoutine(finding.signature)
          : null;
      if (
        routine?.args !== null &&
        routine &&
        inherited.has(
          file +
            ':' +
            routineKey(
              routine.name,
              // The lexer prints array types as `uuid [ ]`.
              signatureTypes(routine.args.replace(/\s*\[\s*\]/g, '[]'))
            )
        )
      )
        continue;
      if (
        !accepted.some(
          (entry) =>
            entry.file === file &&
            entry.signature === finding.signature &&
            entry.digest === finding.digest &&
            entry.rules.includes(finding.rule) &&
            (!entry.sourceDigest || entry.sourceDigest === sourceDigest) &&
            (!REVIEW_RULES.has(finding.rule) ||
              (typeof entry.reason === 'string' &&
                entry.reason.trim().length > 0 &&
                entry.sourceDigest === sourceDigest))
        )
      ) {
        findings.push({ file, ...finding, sourceDigest });
      }
    }
    for (const fn of definitions(sql).map(catalogEntry))
      catalog.set(catalogKey(fn), fn);
  }
  return findings;
}

if (require.main === module) {
  try {
    const root = process.cwd();
    const historicalFile = 'scripts/ci/security-definer-historical-blocks.json';
    assertShrinkingBlocks(
      JSON.parse(
        fs.readFileSync(
          path.join(__dirname, 'security-definer-historical-blocks.json'),
          'utf8'
        )
      ),
      JSON.parse(fs.readFileSync(path.join(root, historicalFile), 'utf8'))
    );
    const proposedReviews = readReviewedFile(
      root,
      __dirname,
      'security-definer-reviewed-blocks.json'
    );
    const proposedVerified = readReviewedFile(
      root,
      __dirname,
      'security-definer-verified-findings.json'
    );
    const findings = checkRepository({
      root,
      reviewedBlocks: proposedReviews,
      verifiedFindings: proposedVerified,
      historicalBlocks: JSON.parse(
        fs.readFileSync(path.join(root, historicalFile), 'utf8')
      ),
    });
    const report = process.argv[2];
    if (report)
      fs.writeFileSync(report, JSON.stringify({ findings }, null, 2) + '\n');
    for (const f of findings)
      console.error(
        f.file +
          (f.line ? ':' + f.line : '') +
          ': ' +
          f.signature +
          ': ' +
          (f.message ?? f.rule)
      );
    console.log('Definer guard: ' + findings.length + ' new finding(s).');
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  BASELINE,
  MIGRATIONS,
  lintMigration,
  checkRepository,
  unsafeGuards,
};
