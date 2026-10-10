#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
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
import { runTutoringTeacherHoursConcurrency } from './tutoring-teacher-hours-concurrency.mjs';

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
  throw new Error('Owned isolated project collision');
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', 'apps/database/supabase'],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(Boolean);
const fixtures = ['tutoring-teacher-hours.sql'];
const ports = await chooseAvailablePortBlock(identity);
const metadata = await stageDisposableProject({
  repositoryRoot,
  headSha,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: `supabase/tests/${fixtures[0]}`,
});
metadata.typegenOutput = 'packages/types/src/supabase.ts';
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
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  if (args.includes('test')) {
    const container = `supabase_db_${metadata.projectId}`;
    for (const fixture of fixtures) {
      const target = '/tmp/tutoring-teacher-hours-contract.sql';
      execFileSync('docker', [
        'cp',
        path.resolve(metadata.disposableRoot, 'supabase/tests', fixture),
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
          '-U',
          'supabase_admin',
          '--dbname',
          'postgres',
          '-f',
          target,
        ],
        { encoding: 'utf8' }
      );
      console.log(`SQL fixture: ${fixture}\n${tap}`);
      assertStrictTap(tap);
    }
    await runTutoringTeacherHoursConcurrency(metadata);
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
