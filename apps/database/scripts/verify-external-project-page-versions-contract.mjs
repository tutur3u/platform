#!/usr/bin/env node
// Real-stack contract for CMS page versions: apply the complete tracked
// schema to a disposable Supabase stack, then run the pgTAP suite that the
// PGlite harness (external-project-page-versions.test.mjs) also runs.
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

export const pageVersionsFixture = 'external-project-page-versions.sql';
export const pageVersionsMigrations = [
  'apps/database/supabase/migrations/20261104135900_external_project_edit_permission.sql',
  'apps/database/supabase/migrations/20261104140000_external_project_page_versions.sql',
];
export const pageVersionsAssertionCount = 43;

export function validatePageVersionsTrackedFiles(trackedFiles) {
  for (const required of [
    'apps/database/supabase/config.toml',
    `apps/database/supabase/tests/${pageVersionsFixture}`,
    ...pageVersionsMigrations,
  ]) {
    if (!trackedFiles.includes(required))
      throw new Error(`Missing tracked CMS page-version input: ${required}`);
  }
  for (const suffix of [
    '_external_project_edit_permission.sql',
    '_external_project_page_versions.sql',
  ]) {
    const matches = trackedFiles.filter(
      (file) =>
        file.startsWith('apps/database/supabase/migrations/') &&
        file.endsWith(suffix)
    );
    if (matches.length !== 1)
      throw new Error(`Requires exactly one forward migration *${suffix}`);
  }
  return [pageVersionsFixture];
}

export function assertPageVersionsTap(tap) {
  assertStrictTap(tap);
  const plan = /^1\.\.(\d+)$/mu.exec(tap);
  if (Number(plan?.[1]) !== pageVersionsAssertionCount)
    throw new Error(
      `CMS page versions requires exactly ${pageVersionsAssertionCount} strict TAP assertions`
    );
}

export async function verifyPageVersionsDatabaseContract() {
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
  const fixtures = validatePageVersionsTrackedFiles(trackedFiles);
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
        const target = '/tmp/external-project-page-versions-contract.sql';
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
        assertPageVersionsTap(tap);
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
  process.exitCode = await verifyPageVersionsDatabaseContract();
}
