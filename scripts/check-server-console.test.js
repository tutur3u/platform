const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectServerLoggingPolicyViolations,
  filterServerLoggingPolicyViolations,
} = require('./check-server-console.js');

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
