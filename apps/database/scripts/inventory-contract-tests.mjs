import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const INVENTORY_SQL_FIXTURES = [
  'inventory-offline-create.sql',
  'inventory-merge.sql',
  'inventory-active-warehouses.sql',
  'inventory-merge-restoration.sql',
  'inventory-merge-readiness.sql',
];

export function hasCompletePassingTap(tap) {
  const plan = tap.match(/^1\.\.(\d+)$/m);
  const passes = [...tap.matchAll(/^ok (\d+) - /gm)].map((m) => Number(m[1]));
  return (
    !!plan &&
    Number(plan[1]) > 0 &&
    !/^not ok /m.test(tap) &&
    passes.length === Number(plan[1]) &&
    passes.every((n, i) => n === i + 1)
  );
}

/** Called inside the owned lifecycle's testing phase, so any SQL/concurrency
 * failure retains its error and still runs the lifecycle's scoped cleanup. */
export function runInventoryContractTests(
  metadata,
  { execute = execFileSync, log = console.log } = {}
) {
  const container = `supabase_db_${metadata.projectId}`;
  for (const fixture of INVENTORY_SQL_FIXTURES) {
    const target = '/tmp/inventory-contract.sql';
    execute('docker', [
      'cp',
      path.resolve(metadata.disposableRoot, 'supabase/tests', fixture),
      `${container}:${target}`,
    ]);
    const tap = execute(
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
    log(`SQL fixture: ${fixture}\n${tap}`);
    if (!hasCompletePassingTap(tap)) return { code: 1 };
  }
  // The .mjs executor validates owned metadata, exact repository and container,
  // then opens three clients to prove independent concurrent writer behavior.
  execute(
    process.execPath,
    [
      path.resolve(
        metadata.repositoryRoot,
        'apps/database/supabase/tests/inventory-merge-concurrency.mjs'
      ),
      metadata.disposableRoot,
    ],
    { cwd: metadata.repositoryRoot, stdio: 'inherit', timeout: 120000 }
  );
  return { code: 0 };
}
