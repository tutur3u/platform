import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const localDblinkFixtures = new Set([
  'employee-google-destination-migration.sql',
  'employee-retained-mailbox-adoption.sql',
  'employee-managed-profile-concurrency.sql',
]);

export function stageLocalDblinkHelpers({
  packets,
  disposableRoot,
  container,
  cwd,
  bounded,
}) {
  if (!packets.some(([file]) => localDblinkFixtures.has(file))) return;
  bounded(
    'docker',
    [
      'cp',
      path.join(disposableRoot, 'supabase/tests/helpers'),
      `${container}:/tmp/helpers`,
    ],
    cwd,
    10000
  );
}

export function assertFixtureHash(disposableRoot, file, expected) {
  const fixture = path.join(disposableRoot, 'supabase/tests', file);
  const actual = createHash('sha256')
    .update(readFileSync(fixture))
    .digest('hex');
  if (actual !== expected) throw new Error('Isolated fixture differs');
  return fixture;
}

export function stageFixtureCopy({ fixture, container, cwd, bounded }) {
  bounded(
    'docker',
    ['cp', fixture, `${container}:/tmp/employee-schema-contract.sql`],
    cwd,
    10000
  );
}
