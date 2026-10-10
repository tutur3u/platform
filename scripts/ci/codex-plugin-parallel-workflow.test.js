const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('codex-plugin.yaml');
const job = workflow.jobs.validate;
const steps = job.steps;
const groupIndex = steps.findIndex((step) => step.parallel);

test('plugin pilot preserves its triggers, switchboard and required check', () => {
  assert.deepEqual(workflow.on, { push: null, workflow_dispatch: null });
  assert.deepEqual(Object.keys(workflow.jobs), ['check-ci', 'validate']);
  assert.deepEqual(workflow.jobs['check-ci'], {
    uses: './.github/workflows/ci-check.yml',
    with: { workflow_name: 'codex-plugin.yaml' },
  });
  assert.equal(job.name, 'Validate Tuturuuu Codex Plugin');
  assert.deepEqual(job.needs, ['check-ci']);
  assert.equal(job.if, "needs.check-ci.outputs.should_run == 'true'");
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job['timeout-minutes'], 15);
  assert.equal(job['continue-on-error'], undefined);
});

test('checkout, Python setup, validator and hash-locked install precede both suites', () => {
  assert.equal(groupIndex, 4);
  assert.deepEqual(steps.slice(0, groupIndex), [
    {
      name: 'Checkout code',
      uses: 'actions/checkout@v7',
      with: { 'fetch-depth': 2 },
    },
    {
      name: 'Setup Python',
      uses: 'actions/setup-python@v7',
      with: {
        'python-version': '3.13',
        cache: 'pip',
        'cache-dependency-path': 'plugins/tuturuuu/mcp/requirements.lock',
      },
    },
    {
      name: 'Validate plugin',
      run: 'python3 plugins/tuturuuu/scripts/validate_plugin.py',
    },
    {
      name: 'Install local MCP test dependency',
      run: 'python3 -m pip install --require-hashes -r plugins/tuturuuu/mcp/requirements.lock',
    },
  ]);
});

test('exactly two independent suites share the native completion barrier', () => {
  assert.equal(steps.filter((step) => step.parallel).length, 1);
  assert.deepEqual(steps[groupIndex], {
    parallel: [
      {
        name: 'Test local MCP boundaries and stdio contract',
        shell: 'bash',
        'timeout-minutes': 5,
        run: "ulimit -v 1048576\npython3 -m unittest discover -s plugins/tuturuuu/mcp -p 'test_*.py'\n",
      },
      {
        name: 'Test orchestration evidence boundaries',
        shell: 'bash',
        'timeout-minutes': 5,
        run: "ulimit -v 1048576\npython3 -m unittest discover -s plugins/tuturuuu/scripts -p 'test_program*.py'\n",
      },
    ],
  });
  // Exact child mappings reject failure masking, conditionals, extra fan-out,
  // shell backgrounding and test discovery changes. GitHub owns the barrier.
  assert.deepEqual(steps.slice(groupIndex + 1), [
    {
      name: 'Validate docs navigation JSON',
      run: 'python3 -m json.tool apps/docs/docs.json > /dev/null',
    },
  ]);
});
