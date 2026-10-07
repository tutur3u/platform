const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

function admitted(job, { github, needs }, cancelled = false) {
  const expression = job.if
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/needs\.([a-z-]+)/g, (_, key) => `needs[${JSON.stringify(key)}]`);
  // GitHub applies success() implicitly unless a status function overrides it.
  if (!/\b(cancelled|always|success|failure)\(/.test(expression)) {
    if (Object.values(needs).some((need) => need.result !== 'success'))
      return false;
  }
  return Boolean(
    new Function(
      'github',
      'needs',
      'startsWith',
      'cancelled',
      `return (${expression});`
    )(
      github,
      needs,
      (value, prefix) => value.startsWith(prefix),
      () => cancelled
    )
  );
}

for (const file of [
  'turbo-unit-tests.yaml',
  'codecov.yaml',
  'biome-check.yaml',
]) {
  const workflow = readWorkflow(file);
  const needs = {
    'check-ci': {
      result: 'success',
      outputs: { should_run: 'true', run_checks: 'true' },
    },
    'duplicate-validation': { result: 'skipped', outputs: {} },
  };

  test(`${file}: ordinary pushes do not allocate a duplicate-proof runner`, () => {
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/heads/fix/example',
    ]) {
      assert.equal(
        admitted(workflow.jobs['duplicate-validation'], {
          github: { event_name: 'push', ref },
          needs: { 'check-ci': needs['check-ci'] },
        }),
        false,
        ref
      );
    }
  });

  test(`${file}: only eligible generated pushes can request evidence reuse`, () => {
    const github = {
      event_name: 'push',
      ref: 'refs/heads/release-please--branches--main',
    };
    const context = { github, needs: { 'check-ci': needs['check-ci'] } };
    assert.equal(
      admitted(workflow.jobs['duplicate-validation'], context),
      true
    );
    assert.equal(
      admitted(workflow.jobs['duplicate-validation'], {
        ...context,
        github: { ...github, event_name: 'workflow_dispatch' },
      }),
      false
    );
    assert.equal(
      admitted(workflow.jobs['duplicate-validation'], {
        ...context,
        needs: { 'check-ci': { result: 'failure', outputs: {} } },
      }),
      false
    );
  });

  test(`${file}: skipped or failed proof still admits real validation`, () => {
    const job =
      workflow.jobs[file === 'biome-check.yaml' ? 'format' : 'test-shards'];
    for (const result of ['skipped', 'failure', 'cancelled']) {
      assert.equal(
        admitted(job, {
          github: {},
          needs: { ...needs, 'duplicate-validation': { result, outputs: {} } },
        }),
        true,
        result
      );
    }
    const proven = {
      ...needs,
      'duplicate-validation': {
        result: 'success',
        outputs: { run_checks: 'false' },
      },
    };
    assert.equal(admitted(job, { github: {}, needs: proven }), false);
    assert.equal(admitted(job, { github: {}, needs }, true), false);
  });
}
