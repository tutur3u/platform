import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildFilters = [
  '@tuturuuu/types',
  '@tuturuuu/supabase',
  '@tuturuuu/masonry',
  '@tuturuuu/internal-api',
  'tuturuuu',
];
const buildArgs = [
  'turbo:local',
  'run',
  'build',
  ...buildFilters.flatMap((filter) => ['-F', filter]),
];
const expectedSetup = `bun i && bun portless:setup && bun ${buildArgs.join(' ')}`;

export function frozenSetupCommands(setup) {
  assert.equal(setup, expectedSetup, 'Root setup prerequisites changed');
  return [
    ['bun', ['install', '--frozen-lockfile']],
    ['bun', ['portless:setup']],
    ['bun', buildArgs],
  ];
}

export function runFrozenProfileSetup({ setup, run }) {
  const commands = frozenSetupCommands(setup);
  const cleanSource = () => {
    const result = run('git', ['status', '--porcelain'], true);
    assert.equal(result.status, 0, 'Source status command failed');
    assert.equal(
      result.stdout.trim(),
      '',
      'Profile setup requires clean source'
    );
  };
  cleanSource();
  for (const [binary, args] of commands) {
    const result = run(binary, args, false);
    assert.equal(result.status, 0, 'Frozen profile setup command failed');
  }
  cleanSource();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    runFrozenProfileSetup({
      setup: scripts.setup,
      run: (binary, args, capture) =>
        spawnSync(binary, args, {
          encoding: 'utf8',
          stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
        }),
    });
  } catch {
    console.error('Frozen profile setup failed; source guards remain strict');
    process.exitCode = 1;
  }
}
