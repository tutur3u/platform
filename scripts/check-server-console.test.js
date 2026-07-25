const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectServerLoggingPolicyViolations,
  filterServerLoggingPolicyViolations,
  hasSearchableExtension,
} = require('./check-server-console.js');

function enoent() {
  return Object.assign(new Error('spawnSync rg ENOENT'), { code: 'ENOENT' });
}

test('filterServerLoggingPolicyViolations ignores tests and log-drain implementations', () => {
  assert.deepEqual(
    filterServerLoggingPolicyViolations([
      'apps/web/src/lib/infrastructure/log-drain.ts:863:export const serverLogger = {',
      'apps/web/src/legacy-api-routes/foo/route.test.ts:12:serverLogger: {',
      'apps/web/src/legacy-api-routes/foo/route.ts:4:import { serverLogger } from "@/lib/infrastructure/log-drain";',
    ]),
    [
      'apps/web/src/legacy-api-routes/foo/route.ts:4:import { serverLogger } from "@/lib/infrastructure/log-drain";',
    ]
  );
});

test('collectServerLoggingPolicyViolations reports runtime serverLogger usage', () => {
  const violations = collectServerLoggingPolicyViolations({
    rootDir: '/repo',
    searchRoots: ['apps/web/src'],
    spawn: (command, args, options) => {
      assert.equal(command, 'rg');
      assert.deepEqual(args, [
        '-n',
        '\\b(serverLogger|installConsoleLogDrain)\\b',
        'apps/web/src',
        '-g',
        '*.{ts,tsx,js}',
      ]);
      assert.equal(options.cwd, '/repo');

      return {
        status: 0,
        stdout:
          'apps/web/src/lib/infrastructure/log-drain.ts:863:export const serverLogger = {}\napps/web/src/legacy-api-routes/foo/route.ts:7:serverLogger.warn("x")\n',
      };
    },
  });

  assert.deepEqual(violations, [
    'apps/web/src/legacy-api-routes/foo/route.ts:7:serverLogger.warn("x")',
  ]);
});

test('collectServerLoggingPolicyViolations falls back to git grep without ripgrep', () => {
  // GitHub runners ship no ripgrep, so the check has to survive without it
  // rather than dying on spawnSync ENOENT.
  const commands = [];
  const violations = collectServerLoggingPolicyViolations({
    rootDir: '/repo',
    searchRoots: ['apps', 'packages'],
    spawn: (command, args) => {
      commands.push(command);

      if (command === 'rg') {
        return { error: enoent(), status: null, stdout: '' };
      }

      assert.deepEqual(args, [
        'grep',
        '-n',
        '--untracked',
        '-E',
        '\\b(serverLogger|installConsoleLogDrain)\\b',
        '--',
        'apps',
        'packages',
      ]);

      return {
        status: 0,
        stdout: [
          'apps/web/src/app/route.ts:4:serverLogger.warn("x")',
          'apps/docs/logging.md:3:serverLogger',
          '',
        ].join('\n'),
      };
    },
  });

  assert.deepEqual(commands, ['rg', 'git']);
  // git grep cannot filter by extension itself, so the markdown hit is dropped.
  assert.deepEqual(violations, [
    'apps/web/src/app/route.ts:4:serverLogger.warn("x")',
  ]);
});

test('collectServerLoggingPolicyViolations passes when git grep finds nothing', () => {
  assert.deepEqual(
    collectServerLoggingPolicyViolations({
      spawn: (command) =>
        command === 'rg'
          ? { error: enoent(), status: null, stdout: '' }
          : { status: 1, stdout: '' },
    }),
    []
  );
});

test('collectServerLoggingPolicyViolations still surfaces non-ENOENT failures', () => {
  assert.throws(
    () =>
      collectServerLoggingPolicyViolations({
        spawn: () => ({
          error: Object.assign(new Error('boom'), { code: 'EACCES' }),
          status: null,
          stdout: '',
        }),
      }),
    /boom/
  );
});

test('hasSearchableExtension matches only the files ripgrep would have scanned', () => {
  assert.ok(hasSearchableExtension('apps/web/src/app/route.ts:4:serverLogger'));
  assert.ok(hasSearchableExtension('packages/ui/src/a.tsx:1:serverLogger'));
  assert.ok(hasSearchableExtension('scripts/thing.js:1:serverLogger'));
  assert.ok(!hasSearchableExtension('apps/docs/logging.md:3:serverLogger'));
  assert.ok(!hasSearchableExtension('apps/web/messages/en.json:3:x'));
});
