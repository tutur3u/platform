#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const allowedFragments = [
  'apps/web/src/lib/infrastructure/log-drain.ts:',
  'apps/infrastructure/src/lib/infrastructure/log-drain.ts:',
  'apps/infrastructure/src/app/api/v1/infrastructure/users/fields/types/route.ts:',
  '.test.',
  '.spec.',
];

const result = spawnSync(
  'rg',
  [
    '-n',
    'console\\.',
    'apps/web/src/app/api/cron',
    'apps/web/src/lib/infrastructure',
    'apps/infrastructure/src/app/api',
    'apps/infrastructure/src/lib/infrastructure',
    '-g',
    '*.{ts,tsx}',
  ],
  {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }
);

if (result.status === 1) {
  process.exit(0);
}

if (result.error) {
  throw result.error;
}

const normalizePathSeparators = (line) => line.replace(/\\/g, '/');

const violations = result.stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .map(normalizePathSeparators)
  .filter(
    (line) => !allowedFragments.some((fragment) => line.includes(fragment))
  );

if (violations.length > 0) {
  console.error(
    [
      'Server-side console.* calls must use the internal log drain.',
      'Use serverLogger.* from @/lib/infrastructure/log-drain instead.',
      '',
      ...violations,
    ].join('\n')
  );
  process.exit(1);
}
