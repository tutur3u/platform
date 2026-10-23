const test = require('node:test');
const assert = require('node:assert/strict');

const { TSRS_PROJECTS, prefersTsrs, resolveTsrs } = require('./tsrs.js');
const { DEFAULT_PROJECTS, TSRS_VERSION } = require('../ci/tsrs-shadow.js');

test('auto mode stays on tsc pending seeded-error qualification', () => {
  assert.deepEqual([...TSRS_PROJECTS], DEFAULT_PROJECTS);
  assert.equal(prefersTsrs('auto', 'apps/tasks/tsconfig.json'), false);
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
    execFile: (command, args, options) => {
      assert.equal(options.env.npm_config_ignore_scripts, 'true');
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

test('hook resolution never fetches and accepts only an explicit existing TSRS_BIN', () => {
  const execFile = () => {
    throw new Error('network resolution must not run');
  };
  assert.equal(resolveTsrs({ allowNetwork: false, env: {}, execFile }), null);
  assert.equal(
    resolveTsrs({
      allowNetwork: false,
      env: { TSRS_BIN: '/explicit/tsrs' },
      exists: () => true,
      execFile,
    }),
    '/explicit/tsrs'
  );
});

test('REV-6468-5: workflow and runtime TSRS_VERSION pins match exactly', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/tsrs-shadow.yaml'),
    'utf8'
  );
  assert.equal(/^ {2}TSRS_VERSION: (.+)$/m.exec(workflow)?.[1], TSRS_VERSION);
});
