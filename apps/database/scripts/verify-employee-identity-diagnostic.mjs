#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIdentityDiagnostic } from './employee-identity-diagnostic.mjs';
import {
  assertRollbackSource,
  exactSourceSha,
  foundationPackets,
} from './employee-schema-tap.mjs';
import { ensureSupabaseBinary } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const root = process.cwd();
if (
  process.env.GITHUB_REF !==
    'refs/heads/fix/employee-identity-diagnostic-control-20261012' ||
  process.env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
  process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
)
  throw new Error(
    'Exact isolated reviewed control-branch manual diagnostic required'
  );
const sourceSha = exactSourceSha(process.env.EMPLOYEE_SCHEMA_SOURCE_SHA);
if (sourceSha !== '5e05c380f60116e9eba41ba42062738229f877a9')
  throw new Error('Frozen diagnostic source required');
const controlRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const controlSha = exactSourceSha(process.env.EMPLOYEE_SCHEMA_CONTROL_SHA);
if (
  controlSha !== process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: controlRoot,
    encoding: 'utf8',
    timeout: 10000,
  }).trim() !== controlSha ||
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: controlRoot,
    encoding: 'utf8',
    timeout: 10000,
  }).trim()
)
  throw new Error('Exact clean trusted control required');
const controlBaseSha = 'f5d42a16613e8ce97cb923df55c4c77d024e6cfb';
const controlPaths = [
  '.github/workflows/employee-schema-contract.yaml',
  'apps/database/scripts/employee-identity-diagnostic.sql',
  'apps/database/scripts/employee-identity-diagnostic.mjs',
  'apps/database/scripts/employee-identity-diagnostic.test.mjs',
  'apps/database/scripts/verify-employee-identity-diagnostic.mjs',
].sort();
execFileSync(
  'git',
  ['merge-base', '--is-ancestor', controlBaseSha, controlSha],
  {
    cwd: controlRoot,
    timeout: 10000,
    stdio: 'ignore',
  }
);
const changedControlPaths = execFileSync(
  'git',
  ['diff', '--name-only', controlBaseSha, controlSha],
  {
    cwd: controlRoot,
    encoding: 'utf8',
    timeout: 10000,
  }
)
  .trim()
  .split('\n')
  .sort();
if (
  controlSha === controlBaseSha ||
  JSON.stringify(changedControlPaths) !== JSON.stringify(controlPaths)
)
  throw new Error('Reviewed diagnostic-only controller scope required');

const probePath = path.join(
  controlRoot,
  'apps/database/scripts/employee-identity-diagnostic.sql'
);
const probeSha256 =
  'f90e9e70e64ede5d716684bb76c94f072d48e8750344a483265f6feca5e7b617';
if (
  createHash('sha256').update(readFileSync(probePath)).digest('hex') !==
  probeSha256
)
  throw new Error('Probe bytes differ');

if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'linux') {
  throw new Error('This gate requires a disposable hosted Linux runner');
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  timeout: 10000,
}).trim();
if (head !== sourceSha) throw new Error('Source commit differs');
if (
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim()
)
  throw new Error('Tracked source differs from the selected commit');
const identity = deriveIsolatedIdentity({
  headSha: head,
  repositoryPath: root,
});
const ownerPath = path.join(
  process.env.RUNNER_TEMP,
  'employee-schema-owned.json'
);
const binaryPath = await ensureSupabaseBinary(path.join(root, 'apps/database'));
const names = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
  encoding: 'utf8',
  timeout: 10000,
})
  .trim()
  .split('\n');
if (hasProjectCollision(identity.projectId, names))
  throw new Error('Owned project collision');
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', 'apps/database/supabase'],
  {
    encoding: 'utf8',
    timeout: 10000,
  }
)
  .split('\0')
  .filter(Boolean);
const fixtureHashes = foundationPackets.map(([file]) => {
  const relative = `apps/database/supabase/tests/${file}`;
  if (!trackedFiles.includes(relative))
    throw new Error('Required employee packet absent');
  const bytes = readFileSync(path.join(root, relative));
  assertRollbackSource(bytes.toString('utf8'));
  return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const expectedFixtureHashes = [
  'eb1e0d9b7c29177a675b8e58113ba912077fd8aa3c318761d082b1d31d2f2f66',
  '2408463b4caaccd5d20253a57383976b991f1480e79929eb1ffff4ac3686f08e',
  '474366a07604765fd7efa1d678f209b6057528c32becef590a9c69763cb137b3',
  '8efafcdd553417fe92ea32e94210b8c6a75418ed5d9212dc7733f1d3548ec8ef',
  'f07d034034c88c17a357bc23c9a39ffc368af2e1030303bfe65d9cd10281ccd1',
];
if (
  fixtureHashes.some(
    (entry, index) => entry.sha256 !== expectedFixtureHashes[index]
  )
)
  throw new Error('Frozen fixtures differ');
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot: root,
  headSha: head,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: 'supabase/tests/employee-signup-guards.sql',
});
writeFileSync(
  ownerPath,
  JSON.stringify({
    headSha: head,
    projectId: metadata.projectId,
    disposableRoot: metadata.disposableRoot,
  }),
  { flag: 'wx', mode: 0o600 }
);
const receiptDirectory = path.join(
  process.env.RUNNER_TEMP,
  'employee-schema-receipts'
);
mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
let records = [];
let cleanupSucceeded = false;
let currentPhase = 'full-schema-snapshot';
let failureDiagnostic = null;
const bounded = (command, args, cwd, timeout) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Never print SQL diagnostics, fixture identities, CLI tokens or credentials.
  if (result.error || result.signal || result.status !== 0) {
    failureDiagnostic ??= { phase: currentPhase };
    throw new Error('Bounded employee schema command failed');
  }
  return result.stdout;
};
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  try {
    if (args.includes('test')) {
      const container = `supabase_db_${metadata.projectId}`;
      currentPhase = 'probe-hash';
      if (
        createHash('sha256').update(readFileSync(probePath)).digest('hex') !==
        probeSha256
      )
        throw new Error('Probe changed');
      const target = '/tmp/employee-identity-diagnostic.sql';
      currentPhase = 'probe-copy';
      bounded(
        'docker',
        ['cp', probePath, `${container}:${target}`],
        cwd,
        10000
      );
      currentPhase = 'probe-execution';
      const output = bounded(
        'docker',
        [
          'exec',
          '--env',
          'PGOPTIONS=-c statement_timeout=45000 -c lock_timeout=3000',
          container,
          'psql',
          '-X',
          '-q',
          '-A',
          '-t',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'supabase_admin',
          '--dbname',
          'postgres',
          '-f',
          target,
        ],
        cwd,
        60000
      );
      currentPhase = 'probe-parse';
      records = parseIdentityDiagnostic(output);
      currentPhase = 'probe-rollback-proof';
      if (
        records.some(
          (row) =>
            !row.caseRolledBack ||
            !row.intentBeforeimageRetained ||
            !row.reservationBeforeimageRetained
        )
      )
        throw new Error('Diagnostic rollback proof failed');
    } else {
      currentPhase = args.includes('stop')
        ? 'cleanup'
        : args.includes('start')
          ? 'start'
          : 'reset';
      bounded(
        command,
        args.includes('start') ? [...args, '--exclude', excluded] : args,
        cwd,
        args.includes('stop') ? 60000 : 600000
      );
      if (args.includes('stop')) {
        currentPhase = 'cleanup-proof';
        const names = bounded(
          'docker',
          ['ps', '-a', '--format', '{{.Names}}'],
          cwd,
          10000
        );
        if (
          names.trim().split('\n').includes(`supabase_db_${metadata.projectId}`)
        ) {
          throw new Error('Owned database remains after stop');
        }
        cleanupSucceeded = true;
      }
    }
    return { code: 0 };
  } catch {
    failureDiagnostic ??= { phase: currentPhase };
    return { code: 1 };
  }
};
let lifecycleCode = 1;
try {
  // Verify complete tracked database snapshot, including every migration, not only fixtures.
  for (const file of trackedFiles.filter(
    (file) => !file.endsWith('/supabase/config.toml')
  )) {
    if (
      !readFileSync(path.join(root, file)).equals(
        readFileSync(
          path.join(metadata.disposableRoot, file.replace('apps/database/', ''))
        )
      )
    )
      throw new Error('Full schema snapshot differs');
  }
  lifecycleCode = await runIsolatedLifecycle({ binaryPath, metadata, runner });
} catch {
  // No raw exception text can expose SQL values or private CLI output.
  failureDiagnostic ??= { phase: currentPhase };
  lifecycleCode = 1;
}
const receipt = {
  version: 3,
  diagnosticOnly: true,
  schemaQualified: false,
  assertionsQualified: false,
  controlSha,
  controlBaseSha,
  sourceSha,
  fixtureHashes,
  probeSha256,
  records,
  lifecycleCode,
  cleanupSucceeded,
  nativeBackendQualified: false,
  providerQualified: false,
  productionApplied: false,
  ...(failureDiagnostic ? { failureDiagnostic } : {}),
};
writeFileSync(
  path.join(receiptDirectory, 'identity-diagnostic.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(
  JSON.stringify({
    diagnosticOnly: true,
    schemaQualified: false,
    records: records.length,
    cleanupSucceeded,
  })
);
process.exitCode =
  lifecycleCode === 0 && cleanupSucceeded && records.length === 3 ? 0 : 1;
