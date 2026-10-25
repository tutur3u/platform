const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const { matchesFilter } = require('./node-version-pin');

const apps = ['colab', 'cron-control', 'lettin'];
const workflows = readAllWorkflows();
const workspaceManifests = apps.map((app) => ({
  name: `@tuturuuu/${app}`,
  path: `apps/${app}`,
  dependencies: [],
}));
function decide(app, changedFiles, eventName) {
  const input = {
    workflowName: `${app}-cloudflare.yaml`,
    changedFiles,
    eventName,
    workspaceManifests,
  };
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `import { getWorkflowDecision } from './tuturuuu.ts'; console.log(JSON.stringify(getWorkflowDecision(${JSON.stringify(input)})));`,
      ],
      { encoding: 'utf8' }
    )
  );
}

for (const app of apps) {
  for (const event of ['pull_request', 'push']) {
    test(`a pin-only change starts and selects ${app} validation on ${event}`, () => {
      const filter = workflows[`${app}-cloudflare.yaml`].on[event].paths;
      assert.ok(
        filter.some((pattern) => matchesFilter('.node-version', pattern))
      );
      const unrelated = decide(app, ['apps/docs/README.md'], event);
      assert.equal(
        unrelated.shouldRun,
        false,
        'complete manifests must not fail open'
      );
      assert.deepEqual(unrelated.matchedPaths, []);
      const selected = decide(app, ['.node-version'], event);
      assert.equal(selected.shouldRun, true);
      assert.deepEqual(selected.matchedPaths, ['.node-version']);
    });
  }
}
