#!/usr/bin/env node

// Fails when a schedule or heavy background-work owner is added outside
// Cloudflare. Existing owners are listed in the shrink-only allowlist.
// Policy: docs-internal/build/devops/cloudflare-backend-ownership.mdx

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  JUSTIFIED_TARGETS,
  LEGACY_OWNERS,
  TARGETS,
} = require('./cloudflare-backend-ownership-allowlist');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations/';
const SELF_FILES = new Set([
  'scripts/ci/cloudflare-backend-ownership.js',
  'scripts/ci/cloudflare-backend-ownership.test.js',
  'scripts/ci/cloudflare-backend-ownership-allowlist.js',
]);
// Paused runtimes keep retained source but are not active owners.
const PAUSED_PREFIXES = ['apps/tanstack-web/', 'apps/backend/'];
const SOURCE_FILE = /\.(?:[cm]?js|tsx?)$/;
const TEST_FILE = /(?:\.test\.|\.spec\.|\/__tests__\/)/;

function listRepositoryFiles(rootDir = ROOT_DIR) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => fs.existsSync(path.join(rootDir, file)));
}

function isActive(file) {
  return !PAUSED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

// --- pg_cron -------------------------------------------------------------

function readSqlLiteral(sql, start) {
  if (sql[start] === "'") {
    let value = '';
    for (let index = start + 1; index < sql.length; index++) {
      if (sql[index] === "'") {
        if (sql[index + 1] === "'") {
          value += "'";
          index++;
          continue;
        }
        return { value, end: index + 1 };
      }
      value += sql[index];
    }
    return null;
  }
  const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(start));
  if (!tag) return null;
  const close = sql.indexOf(tag[0], start + tag[0].length);
  if (close < 0) return null;
  return {
    value: sql.slice(start + tag[0].length, close),
    end: close + tag[0].length,
  };
}

function readCallArguments(sql, start) {
  const args = [];
  let index = start;
  for (;;) {
    for (;;) {
      if (/\s|,/.test(sql[index] ?? '')) index++;
      else if (sql.startsWith('--', index)) {
        const newline = sql.indexOf('\n', index);
        index = newline < 0 ? sql.length : newline + 1;
      } else break;
    }
    if (sql[index] === ')' || index >= sql.length) return { args, end: index };
    const literal = readSqlLiteral(sql, index);
    if (!literal) return { args, end: index };
    args.push(literal.value);
    index = literal.end;
  }
}

const CRON_CALL = /cron\.(schedule_in_database|schedule|unschedule)\s*\(/iy;

// Returns schedule/unschedule calls in source order, skipping SQL comments
// and plain string literals. Dollar-quoted bodies (DO blocks) are scanned
// because migrations call cron.schedule from PL/pgSQL.
function parsePgCronCalls(sql) {
  const calls = [];
  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index);
      index = newline < 0 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', index)) {
      const close = sql.indexOf('*/', index + 2);
      index = close < 0 ? sql.length : close + 2;
      continue;
    }
    if (sql[index] === "'") {
      index = readSqlLiteral(sql, index)?.end ?? sql.length;
      continue;
    }
    CRON_CALL.lastIndex = index;
    const match = CRON_CALL.exec(sql);
    if (!match || (index > 0 && /[\w.]/.test(sql[index - 1]))) {
      index++;
      continue;
    }
    const { args, end } = readCallArguments(sql, CRON_CALL.lastIndex);
    const fn = match[1].toLowerCase();
    if (fn === 'unschedule') {
      if (args.length === 1) calls.push({ type: 'unschedule', name: args[0] });
    } else if (args.length === 2 && fn === 'schedule') {
      calls.push({
        type: 'schedule',
        name: `unnamed:${args[1].trim()}`,
        schedule: args[0].trim(),
      });
    } else if (args.length >= 3) {
      calls.push({
        type: 'schedule',
        name: args[0].trim(),
        schedule: args[1].trim(),
      });
    }
    index = end;
  }
  return calls;
}

function migrationVersion(file) {
  return path.basename(file).split('_')[0];
}

function scanPgCron(files, readFile) {
  const live = new Map();
  const scheduledAfter = [];
  for (const file of files
    .filter((candidate) => candidate.startsWith(MIGRATIONS_DIR))
    .filter((candidate) => candidate.endsWith('.sql'))
    .sort()) {
    for (const call of parsePgCronCalls(readFile(file))) {
      if (call.type === 'unschedule') {
        live.delete(call.name);
        continue;
      }
      live.set(call.name, { file, schedule: call.schedule });
      scheduledAfter.push({
        file,
        name: call.name,
        version: migrationVersion(file),
      });
    }
  }
  return {
    owners: [...live].map(([name, { file, schedule }]) => ({
      id: `pg-cron:${name}:${schedule}`,
      file,
    })),
    schedules: scheduledAfter,
  };
}

// --- Vercel and the Web cron catalog ------------------------------------

function scanVercelCrons(files, readFile) {
  const owners = [];
  for (const file of files.filter((candidate) =>
    /(?:^|\/)vercel\.json$/.test(candidate)
  )) {
    const project = path.posix.dirname(file);
    for (const cron of JSON.parse(readFile(file)).crons ?? []) {
      owners.push({
        id: `vercel-cron:${project}:${cron.path}:${cron.schedule}`,
        file,
      });
    }
  }
  return owners;
}

function scanCronCatalogs(files, readFile) {
  const owners = [];
  for (const file of files.filter((candidate) =>
    /(?:^|\/)cron\.config\.json$/.test(candidate)
  )) {
    const project = path.posix.dirname(file);
    for (const job of JSON.parse(readFile(file)).jobs ?? []) {
      if (job.enabled === false) continue;
      owners.push({
        id: `cron-catalog:${project}:${job.id}:${job.schedule}`,
        file,
      });
    }
  }
  return owners;
}

// --- Supabase Edge Functions and Trigger.dev ----------------------------

function scanEdgeFunctions(files, readFile) {
  const owners = new Map();
  for (const file of files) {
    const match = /^(.*?supabase\/functions\/[^/]+)\//.exec(file);
    if (match && isActive(file)) owners.set(`edge-function:${match[1]}`, file);
    if (/(?:^|\/)supabase\/config\.toml$/.test(file)) {
      for (const section of readFile(file).matchAll(
        /^\s*\[functions\.([^\]]+)\]/gm
      )) {
        owners.set(`edge-function:${file}:${section[1]}`, file);
      }
    }
  }
  return [...owners].map(([id, file]) => ({ id, file }));
}

const TRIGGER_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]@trigger\.dev\//;

function scanTriggerDev(files, readFile) {
  const owners = [];
  for (const file of files.filter(isActive)) {
    if (SELF_FILES.has(file) || file.includes('node_modules/')) continue;
    if (/(?:^|\/)trigger\.config\.[cm]?[jt]s$/.test(file)) {
      owners.push({ id: `trigger-dev:${file}`, file });
    } else if (/(?:^|\/)package\.json$/.test(file)) {
      const manifest = JSON.parse(readFile(file));
      const names = [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ].flatMap((field) => Object.keys(manifest[field] ?? {}));
      if (names.some((name) => name.startsWith('@trigger.dev/'))) {
        owners.push({ id: `trigger-dev:${file}`, file });
      }
    } else if (SOURCE_FILE.test(file) && TRIGGER_IMPORT.test(readFile(file))) {
      owners.push({ id: `trigger-dev:${file}`, file });
    }
  }
  return owners;
}

// --- Next.js background continuations and cron processors ---------------

const NEXT_AFTER_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bafter\b[^}]*\}\s*from\s*['"]next\/server['"]/;

function isAppSource(file) {
  return (
    /^(?:apps|packages)\/[^/]+\/src\//.test(file) &&
    isActive(file) &&
    SOURCE_FILE.test(file) &&
    !TEST_FILE.test(file)
  );
}

function scanNextAfter(files, readFile) {
  return files
    .filter(isAppSource)
    .filter((file) => NEXT_AFTER_IMPORT.test(readFile(file)))
    .map((file) => ({ id: `next-after:${file}`, file }));
}

function scanNextCronRoutes(files) {
  return files
    .filter((file) =>
      /^apps\/[^/]+\/src\/app\/api\/cron\/.+\/route\.[jt]sx?$/.test(file)
    )
    .filter(isActive)
    .map((file) => ({ id: `next-cron-route:${file}`, file }));
}

// --- Evaluation ----------------------------------------------------------

const KIND_GUIDANCE = {
  'vercel-cron':
    'add a Cron Control job (Cloudflare Cron Trigger) instead of a vercel.json cron',
  'cron-catalog':
    'define the schedule in apps/cron-control instead of the Web cron catalog',
  'pg-cron':
    'schedule database work from Cloudflare; pg_cron is limited to the justified legacy maintenance jobs',
  'edge-function':
    'implement the service as a Cloudflare Worker instead of a Supabase Edge Function',
  'trigger-dev':
    'use Cloudflare Workflows, Queues or Cron Triggers instead of Trigger.dev',
  'next-after':
    'persist the job and drain it from a Cloudflare Queue consumer instead of Next after()',
  'next-cron-route':
    'implement new scheduled processors in a Cloudflare Worker instead of a Next.js /api/cron route',
};

function kindOf(id) {
  return id.slice(0, id.indexOf(':'));
}

function scanOwners({ files, readFile }) {
  const pgCron = scanPgCron(files, readFile);
  return {
    owners: [
      ...scanVercelCrons(files, readFile),
      ...scanCronCatalogs(files, readFile),
      ...pgCron.owners,
      ...scanEdgeFunctions(files, readFile),
      ...scanTriggerDev(files, readFile),
      ...scanNextAfter(files, readFile),
      ...scanNextCronRoutes(files),
    ],
    pgCronSchedules: pgCron.schedules,
  };
}

function evaluateOwnership({
  files,
  readFile,
  allowlist = LEGACY_OWNERS,
  migrationCutoff,
}) {
  const { owners, pgCronSchedules } = scanOwners({ files, readFile });
  const allowed = new Map(allowlist.map((owner) => [owner.id, owner]));
  const discovered = new Set(owners.map((owner) => owner.id));
  const violations = [];

  for (const owner of owners) {
    if (allowed.has(owner.id)) continue;
    violations.push(
      `New ${kindOf(owner.id)} owner outside Cloudflare: ${owner.id} (${owner.file}). ` +
        `${KIND_GUIDANCE[kindOf(owner.id)]}.`
    );
  }
  for (const owner of allowlist) {
    if (!discovered.has(owner.id)) {
      violations.push(
        `Stale allowlist entry ${owner.id}: the legacy owner no longer exists, so delete the entry (the allowlist only shrinks).`
      );
    }
  }
  // A new migration may re-schedule a justified retained pg_cron job, but it
  // cannot schedule anything else, even under an allowlisted name.
  for (const schedule of pgCronSchedules) {
    if (migrationCutoff && schedule.version <= migrationCutoff) continue;
    const retained = allowlist.some(
      (owner) =>
        owner.id.startsWith(`pg-cron:${schedule.name}:`) &&
        owner.target === TARGETS.retainPostgres
    );
    if (!retained) {
      violations.push(
        `Migration ${schedule.file} calls cron.schedule for ${schedule.name}. ${KIND_GUIDANCE['pg-cron']}.`
      );
    }
  }
  return { owners, violations };
}

function validateAllowlist(allowlist = LEGACY_OWNERS) {
  const problems = [];
  const ids = new Set();
  const targets = new Set(Object.values(TARGETS));
  for (const owner of allowlist) {
    if (ids.has(owner.id)) problems.push(`Duplicate entry ${owner.id}`);
    ids.add(owner.id);
    if (!KIND_GUIDANCE[kindOf(owner.id)])
      problems.push(`Unknown kind for ${owner.id}`);
    if (!owner.owner) problems.push(`Missing owner for ${owner.id}`);
    if (!targets.has(owner.target))
      problems.push(`Unknown target ${owner.target} for ${owner.id}`);
    if (!owner.plan) problems.push(`Missing migration plan for ${owner.id}`);
    if (
      JUSTIFIED_TARGETS.has(owner.target) &&
      (owner.justification ?? '').length < 80
    ) {
      problems.push(`Missing exception justification for ${owner.id}`);
    }
  }
  return problems;
}

// Migrations at or before this version predate the rule.
const MIGRATION_CUTOFF = '20261023000000';

function checkRepository(rootDir = ROOT_DIR) {
  const files = listRepositoryFiles(rootDir);
  return evaluateOwnership({
    files,
    readFile: (file) => fs.readFileSync(path.join(rootDir, file), 'utf8'),
    migrationCutoff: MIGRATION_CUTOFF,
  });
}

if (require.main === module) {
  const problems = [...validateAllowlist(), ...checkRepository().violations];
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('Cloudflare backend ownership check passed.');
}

module.exports = {
  MIGRATION_CUTOFF,
  checkRepository,
  evaluateOwnership,
  parsePgCronCalls,
  scanOwners,
  validateAllowlist,
};
