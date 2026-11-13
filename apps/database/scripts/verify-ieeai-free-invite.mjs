import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertStrictTap } from './programming-database-tap.mjs';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';
import { runIeeaiInviteRaces } from './ieeai-free-invite-concurrency.mjs';
import { generateIeeaiInviteTypes } from './ieeai-free-invite-types.mjs';

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
assert.equal(hasProjectCollision(identity.projectId, names), false);
const ports = await chooseAvailablePortBlock(identity);
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
const snapshot = createHash('sha256');
for (const file of trackedFiles)
  snapshot.update(file).update('\0').update(readFileSync(file));
console.log(`Disposable schema snapshot SHA256: ${snapshot.digest('hex')}`);
const metadata = await stageDisposableProject({
  repositoryRoot,
  headSha,
  projectId: identity.projectId,
  basePort: ports.basePort,
  trackedFiles,
  testPath: 'supabase/tests/ieeai-free-invite.sql',
  typegenOutput: 'packages/types/src/supabase.ts',
});
console.log(
  `Disposable project: ${metadata.projectId}; recovery root: ${metadata.disposableRoot}`
);
const binaryPath = await ensureSupabaseBinary(
  path.join(repositoryRoot, 'apps/database')
);
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const runner = async (command, args, cwd) => {
  if (args.includes('test')) {
    const psqlArgs = [
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
    ];
    const execute = (sql) =>
      execFileSync('docker', psqlArgs, {
        encoding: 'utf8',
        input: sql,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      });
    const tap = execute(
      readFileSync(path.join(metadata.disposableRoot, metadata.testPath))
    );
    console.log(tap);
    assertStrictTap(tap);
    const rollback = readFileSync(
      'apps/database/supabase/rollbacks/20261112133000_ieeai_free_invite_acceptance.sql',
      'utf8'
    );
    execute(rollback);
    assert.equal(
      execute(
        "SELECT to_regprocedure('private.accept_ieeai_free_workspace_invite(text,uuid,uuid,uuid[])') IS NULL;"
      ).trim(),
      't'
    );
    execute(
      readFileSync(
        'apps/database/supabase/migrations/20261112133000_ieeai_free_invite_acceptance.sql',
        'utf8'
      )
    );
    assert.equal(
      execute(
        "SELECT has_function_privilege('service_role', 'private.accept_ieeai_free_workspace_invite(text,uuid,uuid,uuid[])', 'EXECUTE');"
      ).trim(),
      't'
    );
    console.log('rollback/reapply: passed');
    await runIeeaiInviteRaces(psqlArgs, execute);
    return { code: 0 };
  }
  return runCommand(
    command,
    args.includes('start') ? [...args, '--exclude', excluded] : args,
    cwd,
    { stdio: 'inherit' }
  );
};
process.exitCode = await runIsolatedLifecycle({
  binaryPath,
  metadata,
  runner,
  typegen: generateIeeaiInviteTypes,
});
