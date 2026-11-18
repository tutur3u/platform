import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BUDGET_MIB,
  measureUpload,
  wranglerGzipKiB,
} from './web-opennext-size.mjs';
import { deploymentId, judge } from './web-opennext-smoke.mjs';

test('measures every module except source maps and gates on the largest estimate', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'web-opennext-size-')));
  mkdirSync(join(dir, 'chunks'));
  writeFileSync(join(dir, 'worker.js'), 'export default {};\n'.repeat(1000));
  writeFileSync(join(dir, 'chunks/a.js'), 'const a = 1;\n'.repeat(1000));
  writeFileSync(join(dir, 'worker.js.map'), 'x'.repeat(100000));
  const result = measureUpload(dir);
  assert.deepEqual(result.files, ['chunks/a.js', 'worker.js']);
  assert.ok(result.perFileGzipBytes >= result.wholeGzipBytes / 2);
  assert.equal(result.budgetMiB, BUDGET_MIB);
  const withLog = measureUpload(
    dir,
    'Total Upload: 50000.00 KiB / gzip: 10240.00 KiB\n'
  );
  assert.equal(withLog.wranglerGzipKiB, 10240);
  assert.equal(withLog.gatedMiB, 10);
  assert.ok(withLog.gatedMiB > BUDGET_MIB);
  assert.equal(wranglerGzipKiB('no figure'), null);
});

test('smoke requires the commit and the family deployment id', () => {
  const sha = 'c'.repeat(40);
  const emitted = [
    { file: 'a.json', deploymentId: deploymentId('public-docs', sha) },
  ];
  const ok = {
    status: 200,
    deploymentId: deploymentId('public-docs', sha),
    body: JSON.stringify({ commitHash: sha }),
  };
  const page = { status: 200, deploymentId: null, body: '' };
  assert.deepEqual(
    judge({
      family: 'public-docs',
      sha,
      buildInfo: ok,
      probes: [{ path: '/docs', status: 200, response: page }],
      emitted,
    }),
    []
  );
  const problems = judge({
    family: 'public-docs',
    sha,
    buildInfo: {
      ...ok,
      deploymentId: 'web-public-docs-000000000000',
      body: '{"commitHash":"x"}',
    },
    probes: [
      { path: '/docs', status: 200, response: { ...page, status: 500 } },
    ],
    emitted,
  });
  assert.equal(problems.length, 3);
  assert.match(
    judge({
      family: 'public-docs',
      sha,
      buildInfo: ok,
      probes: [],
      emitted: [],
    })[0],
    /no emitted/u
  );
  assert.match(
    judge({
      family: 'public-docs',
      sha,
      buildInfo: ok,
      probes: [],
      emitted: [
        { file: 'b.json', deploymentId: 'web-api-identity-cccccccccccc' },
      ],
    })[0],
    /differs/u
  );
});
