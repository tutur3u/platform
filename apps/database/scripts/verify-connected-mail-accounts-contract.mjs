#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export const connectedMailFixture = 'connected-mail-accounts.sql';
export const connectedMailMigration =
  'apps/database/supabase/migrations/20261011002106_connected_mail_accounts.sql';
export const connectedMailAssertionCount = 10;

export function validateConnectedMailTrackedFiles(trackedFiles) {
  for (const required of [
    'apps/database/supabase/config.toml',
    connectedMailMigration,
    `apps/database/supabase/tests/${connectedMailFixture}`,
  ]) {
    if (!trackedFiles.includes(required))
      throw new Error(
        `Missing tracked Connected Mail schema input: ${required}`
      );
  }
  return [connectedMailFixture];
}

export function assertConnectedMailTap(tap) {
  assertStrictTap(tap);
  const plan = /^1\.\.(\d+)$/mu.exec(tap);
  if (Number(plan?.[1]) !== connectedMailAssertionCount)
    throw new Error('Connected Mail requires exactly 10 strict TAP assertions');
}

export async function verifyConnectedMailDatabaseContract() {
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
  const fixtures = validateConnectedMailTrackedFiles(trackedFiles);
  console.log('Complete tracked Supabase graph:');
  console.log(
    execFileSync('git', ['ls-files', '-s', 'apps/database/supabase'], {
      encoding: 'utf8',
    })
  );
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
        const target = '/tmp/connected-mail-accounts-contract.sql';
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
        assertConnectedMailTap(tap);
      }
      return { code: 0 };
    }
    return runCommand(
      command,
      args.includes('start') ? [...args, '--exclude', excluded] : args,
      cwd,
      { stdio: 'inherit' }
    );
  };
  return runIsolatedLifecycle({ binaryPath, metadata, runner });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await verifyConnectedMailDatabaseContract();
}
