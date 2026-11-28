const assert = require('node:assert/strict');
const test = require('node:test');
const { lintSelfHostedWorkflows } = require('./self-hosted-policy');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

test('all workflow routes, including reusable callees, select hosted runners', async () => {
  assert.deepEqual(await lintSelfHostedWorkflows(readAllWorkflows()), []);
});

for (const event of ['pull_request', 'pull_request_target', 'workflow_call']) {
  test(`${event} rejects literal, conditional and matrix self-hosted routes`, async () => {
    for (const job of [
      { 'runs-on': ['self-hosted', 'macOS', 'ARM64'] },
      { 'runs-on': 'tuturuuu-pr-ephemeral' },
      {
        'runs-on':
          "${{ inputs.trusted && 'ttr-selfhosted-studio' || 'ubuntu-latest' }}",
      },
      {
        'runs-on': '${{ matrix.os }}',
        strategy: {
          matrix: {
            os: ['ubuntu-latest'],
            include: [{ os: 'tuturuuu-pr-ephemeral' }],
          },
        },
      },
    ]) {
      assert.equal(
        (
          await lintSelfHostedWorkflows({
            'synthetic.yaml': {
              on: { [event]: null },
              jobs: { validation: job },
            },
          })
        ).length,
        1
      );
    }
  });
}
