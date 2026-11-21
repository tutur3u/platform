#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const repositoryRoot = process.cwd();

const apiConfig = readFileSync('apps/database/supabase/config.toml', 'utf8')
  .split(/^\[/m)
  .find((section) => section.startsWith('api]'));
const schemaSetting = apiConfig?.match(/^schemas\s*=\s*(\[[^\n]*\])/m)?.[1];
if (!schemaSetting) throw new Error('Missing exposed API schemas');
const configuredSchemas = JSON.parse(schemaSetting);
if (
  !Array.isArray(configuredSchemas) ||
  configuredSchemas.some((s) => typeof s !== 'string' || !s)
)
  throw new Error('Invalid exposed API schemas');
const exposedSchemas = [...new Set(['public', ...configuredSchemas])].join(',');

const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const identity = deriveIsolatedIdentity({
  headSha,
  repositoryPath: repositoryRoot,
});
const names = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
if (hasProjectCollision(identity.projectId, names))
  throw new Error('Owned isolated project collision');
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', 'apps/database/supabase'],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(Boolean);
const authHookFixture =
  'fixtures/security-egress/security-mfa-verification-hook.sql';
const fixtures = [
  'tests/security-egress-budgets.sql',
  authHookFixture,
  'tests/security-budget-entitlements.sql',
  'tests/security-user-email-helper.sql',
  'tests/security-notification-email-access.sql',
  'tests/security-definer-function-grants.sql',
  'tests/security-definer-search-paths.sql',
  'tests/security-definer-policy-callers.sql',
  'tests/security-definer-chat-access.sql',
  'fixtures/security-egress/quarantine-orphan-role-permissions.sql',
];
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot,
  headSha,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: `supabase/${fixtures[0]}`,
  typegenOutput: 'packages/types/src/supabase.ts',
});
console.log(
  `Exact source: ${headSha}; isolated project: ${metadata.projectId}`
);
let binaryPath;
try {
  for (const file of trackedFiles.filter(
    (file) => !file.endsWith('/supabase/config.toml')
  )) {
    if (
      !readFileSync(file).equals(
        readFileSync(
          path.resolve(
            metadata.disposableRoot,
            file.replace('apps/database/', '')
          )
        )
      )
    )
      throw new Error(`Isolated source snapshot mismatch: ${file}`);
  }
  binaryPath = await ensureSupabaseBinary(
    path.resolve(repositoryRoot, 'apps/database')
  );
} catch (error) {
  await removeDisposableRoot(metadata.disposableRoot);
  throw error;
}
const excluded =
  'gotrue,realtime,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  if (args.includes('test')) {
    const container = `supabase_db_${metadata.projectId}`;
    const fixtureRoot = '/tmp/security-egress-contract';
    const quarantineMigration =
      '20261030130950_quarantine_orphan_role_permissions.sql';
    execFileSync('docker', [
      'exec',
      container,
      'mkdir',
      '-p',
      `${fixtureRoot}/tests`,
      `${fixtureRoot}/migrations`,
    ]);
    execFileSync('docker', [
      'cp',
      path.resolve(
        metadata.disposableRoot,
        'supabase/migrations',
        quarantineMigration
      ),
      `${container}:${fixtureRoot}/migrations/${quarantineMigration}`,
    ]);
    for (const fixture of fixtures) {
      const target = `${fixtureRoot}/tests/${path.basename(fixture)}`;
      execFileSync('docker', [
        'cp',
        path.resolve(metadata.disposableRoot, 'supabase', fixture),
        `${container}:${target}`,
      ]);
      const tap = execFileSync(
        'docker',
        [
          'exec',
          container,
          'psql',
          '-X',
          '-A',
          '-t',
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          `security_exposed_schemas=${exposedSchemas}`,
          '-U',
          fixture === authHookFixture ? 'supabase_admin' : 'postgres',
          '--dbname',
          'postgres',
          '-f',
          target,
        ],
        { encoding: 'utf8' }
      );
      console.log(`SQL fixture: ${fixture}\n${tap}`);
      const plan = tap.match(/^1\.\.(\d+)$/m);
      const passes = [...tap.matchAll(/^ok (\d+) - /gm)].map((match) =>
        Number(match[1])
      );
      if (
        !plan ||
        /^not ok /m.test(tap) ||
        passes.length !== Number(plan[1]) ||
        !passes.every((n, i) => n === i + 1)
      )
        return { code: 1 };
    }
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execute = promisify(execFile);
    const sql = `SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
      SELECT public.reserve_security_budget('[{"key":"api-cost:v1:concurrency-ci","amount":1,"maximum":50,"ttl":120}]'::jsonb)
      FROM generate_series(1,20);`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        execute('docker', [
          'exec',
          container,
          'psql',
          '-X',
          '-A',
          '-t',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'supabase_admin',
          '--dbname',
          'postgres',
          '-c',
          sql,
        ])
      )
    );
    const reservations = results.flatMap(({ stdout }) =>
      stdout.split('\n').filter((line) => /^\{[01],\d+\}$/.test(line))
    );
    const successes = reservations.filter((line) => line === '{1,0}').length;
    if (reservations.length !== 100 || successes !== 50) {
      throw new Error(
        `Concurrent reservation mismatch: ${successes}/100 accepted`
      );
    }
    const used = execFileSync(
      'docker',
      [
        'exec',
        container,
        'psql',
        '-X',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'supabase_admin',
        '--dbname',
        'postgres',
        '-c',
        "SELECT used FROM private.security_budget_counters WHERE key = 'api-cost:v1:concurrency-ci';",
      ],
      { encoding: 'utf8' }
    ).trim();
    if (used !== '50')
      throw new Error(`Concurrent stored counter mismatch: ${used}`);
    console.log('Concurrent clients: exactly 50 of 100 reservations accepted');
    return { code: 0 };
  }
  return runCommand(
    command,
    args.includes('start') ? [...args, '--exclude', excluded] : args,
    cwd,
    { stdio: 'inherit' }
  );
};
process.exitCode = await runIsolatedLifecycle({ binaryPath, metadata, runner });
