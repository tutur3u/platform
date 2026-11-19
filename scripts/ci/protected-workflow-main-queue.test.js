const assert = require('node:assert/strict');
const test = require('node:test');
const {
  boundedMainProducers,
  context,
  pushesMain,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

for (const file of boundedMainProducers) {
  test(`${file}: main keeps the active run and shares the default pending slot`, () => {
    const { concurrency: policy, name: workflow } = workflows[file];
    assert.ok(pushesMain(workflows[file]));
    const first = { ...context('refs/heads/main'), workflow };
    const latest = { ...first, sha: 'latest', run_id: 3 };
    assert.equal(render(policy.group, first), render(policy.group, latest));
    assert.equal(render(policy['cancel-in-progress'], first), false);
    assert.equal(render(policy['cancel-in-progress'], latest), false);
    assert.equal(policy.queue, undefined);
    assert.equal(
      render(policy['cancel-in-progress'], {
        ...latest,
        ref: 'refs/heads/main-spoof',
      }),
      true
    );
  });
}
