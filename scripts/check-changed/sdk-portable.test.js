const assert = require('node:assert/strict');
const { test } = require('node:test');
const { planChecks } = require('./plan.js');

for (const prefix of ['internal-api', 'sdk', 'utils', 'types']) {
  for (const status of ['M', 'D']) {
    test(`SDK portable gate covers ${status} packages/${prefix}`, () => {
      const { steps } = planChecks(
        [{ status, file: `packages/${prefix}/source.js` }],
        { exists: () => false, hasVitest: () => false, workspaces: [] }
      );
      const step = steps.find((entry) => entry.id === 'sdk-portable');
      assert.equal(step.command, 'node');
      assert.deepEqual(step.args, [
        'packages/sdk/scripts/portable-build.cjs',
        '--check',
      ]);
    });
  }
}
test('unrelated docs do not select the SDK portable gate', () => {
  const { steps } = planChecks([{ status: 'M', file: 'README.md' }], {
    exists: () => false,
    hasVitest: () => false,
    workspaces: [],
  });
  assert.equal(
    steps.some((entry) => entry.id === 'sdk-portable'),
    false
  );
});
