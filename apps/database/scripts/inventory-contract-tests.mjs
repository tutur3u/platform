import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const INVENTORY_SQL_FIXTURES = [
  'inventory-offline-create.sql',
  'inventory-merge.sql',
  'inventory-active-warehouses.sql',
  'inventory-merge-restoration.sql',
  'inventory-merge-readiness.sql',
  'inventory-merge-lock-bounds.sql',
  'inventory-season-merge.sql',
];

export function hasCompletePassingTap(tap) {
  const plans = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  const assertions = tap
    .split(/\r?\n/u)
    .filter((line) => /^(?:not )?ok\b/u.test(line));
  return (
    !/^Bail out!/imu.test(tap) &&
    plans.length === 1 &&
    Number(plans[0][1]) > 0 &&
    assertions.length === Number(plans[0][1]) &&
    assertions.every((line, i) =>
      new RegExp(`^ok ${i + 1} - [^#]+$`, 'u').test(line)
    )
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
  for (const executor of [
    'inventory-merge-concurrency.mjs',
    'inventory-season-merge-concurrency.mjs',
  ]) {
    execute(
      process.execPath,
      [
        path.resolve(
          metadata.repositoryRoot,
          'apps/database/supabase/tests',
          executor
        ),
        metadata.disposableRoot,
      ],
      { cwd: metadata.repositoryRoot, stdio: 'inherit', timeout: 120000 }
    );
  }
  return { code: 0 };
}
