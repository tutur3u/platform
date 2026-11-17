#!/usr/bin/env node
/**
 * Apply the complete tracked migration chain to an isolated Supabase stack,
 * read the public schema catalog and compare it with the shrink-only
 * allowlist. Exit 0 pass, 1 violation, 2 setup error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWLIST_PATH,
  CATALOG_SQL,
  evaluatePublicSchemaCatalog,
  parseAllowlist,
  parseCatalogOutput,
} from './public-schema-catalog.mjs';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const EXCLUDED_SERVICES =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';

export function reportCatalogResult({ errors, warnings }, log = console.log) {
  for (const warning of warnings) log(`warning: ${warning}`);
  for (const error of errors) log(`error: ${error}`);
  log(
    errors.length
      ? `public-schema catalog: ${errors.length} violation(s)`
      : 'public-schema catalog: public relations match the allowlist'
  );
  return errors.length ? 1 : 0;
}

export async function verifyPublicSchemaCatalog() {
  const repositoryRoot = process.cwd();
  let allowlist;
  try {
    allowlist = parseAllowlist(
      readFileSync(path.resolve(repositoryRoot, ALLOWLIST_PATH), 'utf8')
    );
  } catch (error) {
    console.error(`public-schema catalog: ${error.message}`);
    return 2;
  }
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
  if (hasProjectCollision(identity.projectId, names)) {
    console.error('public-schema catalog: owned isolated project collision');
    return 2;
  }
  const trackedFiles = execFileSync(
    'git',
    ['ls-files', '-z', 'apps/database/supabase'],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
  const ports = await chooseAvailablePortBlock(identity);
  const metadata = await stageDisposableProject({
    repositoryRoot,
    headSha,
    projectId: identity.projectId,
    basePort: ports.basePort,
    trackedFiles,
  });
  console.log(
    `Exact source: ${headSha}; isolated project: ${metadata.projectId}`
  );
  let binaryPath;
  try {
    binaryPath = await ensureSupabaseBinary(
      path.resolve(repositoryRoot, 'apps/database')
    );
  } catch (error) {
    await removeDisposableRoot(metadata.disposableRoot);
    console.error(`public-schema catalog: ${error.message}`);
    return 2;
  }
  let verdict = 2;
  const runner = async (command, args, cwd) => {
    if (args.includes('test')) {
      try {
        return inspectCatalog();
      } catch (error) {
        console.error(`public-schema catalog: ${error.message}`);
        verdict = 2;
        return { code: 2 };
      }
    }
    return runCommand(
      command,
      args.includes('start') ? [...args, '--exclude', EXCLUDED_SERVICES] : args,
      cwd,
      { stdio: 'inherit' }
    );
  };
  const inspectCatalog = () => {
    const container = `supabase_db_${metadata.projectId}`;
    const local = path.resolve(
      metadata.disposableRoot,
      'public-schema-catalog.sql'
    );
    const target = '/tmp/public-schema-catalog.sql';
    writeFileSync(local, CATALOG_SQL);
    execFileSync('docker', ['cp', local, `${container}:${target}`]);
    const stdout = execFileSync(
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
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    const catalog = parseCatalogOutput(stdout);
    if (process.env.PUBLIC_SCHEMA_CATALOG_OUT)
      writeFileSync(
        process.env.PUBLIC_SCHEMA_CATALOG_OUT,
        `${JSON.stringify(catalog, null, 2)}\n`
      );
    verdict = reportCatalogResult(
      evaluatePublicSchemaCatalog(catalog, allowlist)
    );
    return { code: verdict === 0 ? 0 : 1 };
  };
  const lifecycle = await runIsolatedLifecycle({
    binaryPath,
    metadata,
    runner,
  });
  if (lifecycle === 0) return 0;
  return verdict === 1 ? 1 : lifecycle || 2;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await verifyPublicSchemaCatalog();
}
