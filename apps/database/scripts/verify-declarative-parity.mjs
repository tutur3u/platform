#!/usr/bin/env node
// Declarative schema parity pack runner (plan P2-1). It runs the catalog queries
// in apps/database/verification/declarative-parity inside one read-only,
// time-bounded transaction and emits canonical JSON of per-category counts and
// sha256 digests. Payloads are hashed inside PostgreSQL; the parser rejects any
// output that is not an identity, a digest or an integer, so definitions, qual
// text and row data never reach stdout. The same pack serves the prod-parity
// check, so the URL is read from an environment variable and never put in argv.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const QUERY_DIR = path.resolve(
  here,
  '../verification/declarative-parity'
);
export const CONFIG_PATH = path.resolve(here, '../supabase/config.toml');
export const FORMAT = 'tuturuuu-declarative-parity/v1';
export const DEFAULT_URL_ENV = 'DECLARATIVE_PARITY_DATABASE_URL';
// Every check maps a must-be-zero metric to the flag rows naming its offenders.
export const MUST_BE_ZERO = {
  null_acl_definer_count: 'null_acl_definer',
  unsafe_definer_search_path_count: 'unsafe_definer_search_path',
};
export const SESSION_OPTIONS = [
  'default_transaction_read_only=on',
  'statement_timeout=60s',
  'lock_timeout=1s',
  'idle_in_transaction_session_timeout=120s',
  'search_path=pg_catalog',
];

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;
const CATEGORY = /^[a-z_]+$/;
const DIGEST = /^[0-9a-f]{64}$/;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function readApiSchemas(config) {
  const api = config.split(/^\[api\]\s*$/m)[1]?.split(/^\[/m)[0];
  const schemas = JSON.parse(
    api?.match(/^schemas\s*=\s*(\[[^\]]*\])/m)?.[1] ?? 'null'
  );
  if (
    !Array.isArray(schemas) ||
    !schemas.length ||
    schemas.some((schema) => !SCHEMA_NAME.test(schema))
  ) {
    throw new Error('Cannot derive API exposed schemas');
  }
  return schemas;
}

export function loadQueries(directory = QUERY_DIR) {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort(byCodeUnit)
    .map((name) => {
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      const requires = sql.match(/^-- requires: ([a-z_]+\.[a-z_]+)$/m)?.[1];
      return { name, sql, requires: requires ?? null };
    });
}

export function wrapReadOnly(body, apiSchemas) {
  if (!apiSchemas.every((schema) => SCHEMA_NAME.test(schema))) {
    throw new Error('Invalid API schema name');
  }
  return [
    'begin transaction isolation level repeatable read read only;',
    "set local statement_timeout = '60s';",
    "set local lock_timeout = '1s';",
    "set local idle_in_transaction_session_timeout = '120s';",
    'set local search_path = pg_catalog;',
    `set local parity.api_schemas = '${apiSchemas.join(',')}';`,
    body.trim(),
    'rollback;',
    '',
  ].join('\n');
}

export const PREFLIGHT_SQL = `select 'P' as kind, 'server_version_num' as category,
  '' as identity, current_setting('server_version_num') as value
union all
select 'P', 'relation_readable', r.name,
  (to_regclass(r.name) is not null
    and has_table_privilege(to_regclass(r.name), 'SELECT'))::text
from unnest(array['cron.job']) r(name);`;

// Validates every line before it can reach a report. Errors carry the line
// number only, never the offending content.
export function parseLines(lines) {
  const rows = [];
  lines.forEach((line, index) => {
    if (line === '') return;
    const fail = (reason) => {
      throw new Error(`unexpected-output-shape: line ${index + 1}: ${reason}`);
    };
    const parts = line.split('\t');
    if (parts.length !== 4) fail('column count');
    const [kind, category, identity, value] = parts;
    if (!CATEGORY.test(category)) fail('category');
    if (identity.length > 512 || /[\p{Cc}]/u.test(identity)) fail('identity');
    if (kind === 'O') {
      if (!identity || !DIGEST.test(value)) fail('object row');
    } else if (kind === 'M') {
      if (identity || !/^\d+$/.test(value)) fail('metric row');
    } else if (kind === 'F') {
      if (!identity || value) fail('flag row');
    } else if (kind === 'P') {
      if (!/^(\d+|true|false)$/.test(value)) fail('preflight row');
    } else fail('kind');
    rows.push({ kind, category, identity, value });
  });
  return rows;
}

export function buildReport(
  rows,
  { apiSchemas, preflight = {}, skipped = [] }
) {
  const objects = {};
  const metrics = {};
  const flags = {};
  for (const { kind, category, identity, value } of rows) {
    if (kind === 'O') {
      objects[category] ??= {};
      if (identity in objects[category]) {
        throw new Error(`duplicate-identity: ${category}`);
      }
      objects[category][identity] = value;
    } else if (kind === 'M') metrics[category] = Number(value);
    else if (kind === 'F') {
      flags[category] ??= [];
      flags[category].push(identity);
    }
  }
  const categories = {};
  for (const name of Object.keys(objects).sort(byCodeUnit)) {
    const ids = Object.keys(objects[name]).sort(byCodeUnit);
    const sorted = Object.fromEntries(ids.map((id) => [id, objects[name][id]]));
    categories[name] = {
      count: ids.length,
      sha256: sha256(ids.map((id) => `${id}\t${sorted[id]}\n`).join('')),
      objects: sorted,
    };
  }
  const checks = {};
  for (const [metric, flag] of Object.entries(MUST_BE_ZERO)) {
    if (!(metric in metrics)) throw new Error(`missing-metric: ${metric}`);
    checks[metric] = {
      count: metrics[metric],
      offenders: (flags[flag] ?? []).sort(byCodeUnit),
    };
  }
  const sortedMetrics = Object.fromEntries(
    Object.keys(metrics)
      .sort(byCodeUnit)
      .map((key) => [key, metrics[key]])
  );
  return {
    format: FORMAT,
    serverVersionNum: preflight.server_version_num ?? null,
    apiSchemas,
    skippedCategories: [...skipped].sort(byCodeUnit),
    sha256: sha256(
      Object.entries(categories)
        .map(([name, c]) => `${name}\t${c.count}\t${c.sha256}\n`)
        .join('')
    ),
    ok: Object.values(checks).every((check) => check.count === 0),
    checks,
    metrics: sortedMetrics,
    categories,
  };
}

// Hashes-only form for the prod-parity check: no per-object map at all.
export function hashesOnly(report) {
  return {
    ...report,
    mode: 'hashes-only',
    categories: Object.fromEntries(
      Object.entries(report.categories).map(([name, { count, sha256: d }]) => [
        name,
        { count, sha256: d },
      ])
    ),
  };
}

// Returns identities (names only) of mismatched objects and metrics.
export function compareReports(expected, actual) {
  const categories = {};
  const names = new Set([
    ...Object.keys(expected.categories),
    ...Object.keys(actual.categories),
  ]);
  for (const name of [...names].sort(byCodeUnit)) {
    const a = expected.categories[name];
    const b = actual.categories[name];
    if (a?.sha256 === b?.sha256) continue;
    const left = a?.objects ?? {};
    const right = b?.objects ?? {};
    const ids = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    categories[name] = {
      expected: a ? { count: a.count, sha256: a.sha256 } : null,
      actual: b ? { count: b.count, sha256: b.sha256 } : null,
      missing: ids.filter((id) => !(id in right)).sort(byCodeUnit),
      unexpected: ids.filter((id) => !(id in left)).sort(byCodeUnit),
      changed: ids
        .filter((id) => id in left && id in right && left[id] !== right[id])
        .sort(byCodeUnit),
    };
  }
  const metrics = {};
  for (const key of new Set([
    ...Object.keys(expected.metrics),
    ...Object.keys(actual.metrics),
  ])) {
    if (expected.metrics[key] !== actual.metrics[key]) {
      metrics[key] = {
        expected: expected.metrics[key] ?? null,
        actual: actual.metrics[key] ?? null,
      };
    }
  }
  const equal = !Object.keys(categories).length && !Object.keys(metrics).length;
  return { equal, categories, metrics };
}

export async function collect(
  executor,
  { apiSchemas, queries = loadQueries() }
) {
  const preflight = {};
  for (const row of parseLines(
    await executor.run(wrapReadOnly(PREFLIGHT_SQL, apiSchemas))
  )) {
    if (row.kind !== 'P') throw new Error('unexpected-preflight-row');
    preflight[row.identity || row.category] = row.value;
  }
  const skipped = [];
  const active = queries.filter((query) => {
    if (!query.requires || preflight[query.requires] === 'true') return true;
    skipped.push(query.name.replace(/\.sql$/, ''));
    return false;
  });
  const body = active.map((query) => query.sql.trim()).join('\n');
  const rows = parseLines(await executor.run(wrapReadOnly(body, apiSchemas)));
  return buildReport(rows, { apiSchemas, preflight, skipped });
}

export function psqlInvocation({ dockerContainer, dockerUser, databaseUrl }) {
  const psqlArgs = [
    '-X',
    '-q',
    '-A',
    '-t',
    '-F',
    '\t',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  const pgoptions = SESSION_OPTIONS.map((option) => `-c ${option}`).join(' ');
  if (dockerContainer) {
    return {
      command: 'docker',
      args: [
        'exec',
        '-i',
        '-e',
        `PGOPTIONS=${pgoptions}`,
        '-e',
        'PGAPPNAME=tuturuuu-declarative-parity',
        dockerContainer,
        'psql',
        ...psqlArgs,
        '-U',
        dockerUser || 'postgres',
        '-d',
        'postgres',
        '-f',
        '-',
      ],
      env: process.env,
      secrets: [],
    };
  }
  if (!databaseUrl) throw new Error('missing-database-url');
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('unsupported-database-url');
  }
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: user,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
    PGOPTIONS: pgoptions,
    PGAPPNAME: 'tuturuuu-declarative-parity',
  };
  if (password) env.PGPASSWORD = password;
  else delete env.PGPASSWORD;
  return {
    command: 'psql',
    args: [...psqlArgs, '-f', '-'],
    env,
    secrets: [password, user, url.hostname].filter(Boolean),
  };
}

export function createPsqlExecutor(invocation, spawn = spawnSync) {
  return {
    async run(sql) {
      const result = spawn(invocation.command, invocation.args, {
        input: sql,
        env: invocation.env,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      });
      if (result.error || result.status !== 0) {
        let detail = String(result.stderr ?? result.error?.message ?? '');
        for (const secret of invocation.secrets) {
          detail = detail.split(secret).join('<redacted>');
        }
        throw new Error(
          `psql failed (${result.status ?? 'spawn'}): ${detail.trim()}`
        );
      }
      return String(result.stdout).split('\n');
    },
  };
}

const USAGE = `Usage:
  node apps/database/scripts/verify-declarative-parity.mjs [options]
  node apps/database/scripts/verify-declarative-parity.mjs --compare <a.json> <b.json>

Connection (one of):
  --docker-container <name>  local Supabase DB container (psql as --docker-user, default postgres)
  ${DEFAULT_URL_ENV}         environment variable with a postgres URL
  --database-url-env <NAME>  read the URL from another environment variable

Options:
  --hashes-only      omit per-object digests (prod-parity form)
  --expect <file>    compare with a full report; print mismatched identities only
  --out <file>       write the report to a file instead of stdout

Exit 0: checks pass (and match --expect); 1: check failure or mismatch; 2: error.`;

export function parseArgs(argv) {
  const options = { hashesOnly: false, urlEnv: DEFAULT_URL_ENV };
  const valued = {
    '--docker-container': 'dockerContainer',
    '--docker-user': 'dockerUser',
    '--database-url-env': 'urlEnv',
    '--expect': 'expect',
    '--out': 'out',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--hashes-only') options.hashesOnly = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--compare') {
      options.compare = [argv[index + 1], argv[index + 2]];
      if (options.compare.some((file) => !file)) throw new Error(USAGE);
      index += 2;
    } else if (valued[arg] && argv[index + 1] !== undefined) {
      options[valued[arg]] = argv[index + 1];
      index += 1;
    } else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  return options;
}

function emit(value, out) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (out) fs.writeFileSync(out, text, { mode: 0o600 });
  else process.stdout.write(text);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  if (options.compare) {
    const result = compareReports(...options.compare.map(readJson));
    emit(result, options.out);
    return result.equal ? 0 : 1;
  }
  const apiSchemas = readApiSchemas(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const executor = createPsqlExecutor(
    psqlInvocation({
      dockerContainer: options.dockerContainer,
      dockerUser: options.dockerUser,
      databaseUrl: env[options.urlEnv],
    })
  );
  const report = await collect(executor, { apiSchemas });
  const comparison = options.expect
    ? compareReports(readJson(options.expect), report)
    : null;
  const output = options.hashesOnly
    ? hashesOnly(report)
    : { ...report, mode: 'full' };
  if (comparison) output.comparison = comparison;
  emit(output, options.out);
  return report.ok && (comparison?.equal ?? true) ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 2;
    }
  );
}
