#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertStrictTap } from './programming-database-tap.mjs';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';
import { runSsoConsumptionRace } from './sso-persistence-concurrency.mjs';

const repositoryRoot = process.cwd();
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
  throw new Error('Isolated SSO project collision');
const trackedFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    'apps/database/supabase',
  ],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(Boolean)
  .sort();
const digest = createHash('sha256');
for (const file of trackedFiles)
  digest.update(file).update('\0').update(readFileSync(file));
console.log(
  `SSO schema snapshot SHA256: ${digest.digest('hex')}; parent commit: ${headSha}`
);
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot,
  headSha,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: 'supabase/tests/sso-persistence.sql',
  typegenOutput: 'packages/types/src/supabase.ts',
});
console.log(
  `Isolated database: ${metadata.projectId}; recovery root: ${metadata.disposableRoot}`
);
let binaryPath;
try {
  binaryPath = await ensureSupabaseBinary(
    path.resolve(repositoryRoot, 'apps/database')
  );
} catch (error) {
  await removeDisposableRoot(metadata.disposableRoot);
  throw error;
}
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  if (args.includes('test')) {
    const tap = execFileSync(
      'docker',
      [
        'exec',
        '-i',
        `supabase_db_${metadata.projectId}`,
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
      ],
      {
        encoding: 'utf8',
        input: readFileSync(
          path.join(metadata.disposableRoot, metadata.testPath)
        ),
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    console.log(tap);
    assertStrictTap(tap);
    await runSsoConsumptionRace(metadata);
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
