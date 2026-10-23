const test = require('node:test');
const assert = require('node:assert/strict');

const { TSRS_PROJECTS, prefersTsrs, resolveTsrs } = require('./tsrs.js');
const { DEFAULT_PROJECTS, TSRS_VERSION } = require('../ci/tsrs-shadow.js');

test('auto mode uses tsrs only for parity-qualified projects', () => {
  assert.deepEqual([...TSRS_PROJECTS], DEFAULT_PROJECTS);
  assert.equal(prefersTsrs('auto', 'apps/tasks/tsconfig.json'), true);
  assert.equal(
    prefersTsrs('auto', 'packages/ui/tsconfig.typecheck.json'),
    false
  );
  assert.equal(
    prefersTsrs('tsrs', 'packages/ui/tsconfig.typecheck.json'),
    true
  );
  assert.equal(prefersTsrs('tsc', 'apps/tasks/tsconfig.json'), false);
});

test('resolveTsrs honours TSRS_BIN and the pinned npm exec cache', () => {
  assert.equal(
    resolveTsrs({ env: { TSRS_BIN: '/opt/tsrs' }, exists: () => true }),
    '/opt/tsrs'
  );
  assert.equal(
    resolveTsrs({ env: { TSRS_BIN: '/missing' }, exists: () => false }),
    null
  );
  const calls = [];
  const binary = resolveTsrs({
    env: {},
    exists: (file) => file === '/cache/.bin/tsrs',
    execFile: (command, args) => {
      calls.push([command, ...args]);
      return 'npm notice\n/cache/.bin/tsrs\n';
    },
  });
  assert.equal(binary, '/cache/.bin/tsrs');
  assert.ok(calls[0].includes(`--package=tsrs@${TSRS_VERSION}`));
  assert.equal(
    resolveTsrs({
      env: {},
      exists: () => true,
      execFile: () => {
        throw new Error('offline');
      },
    }),
    null
  );
});
