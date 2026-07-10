const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePromise = import('./actions-storage-report.ts');

test('classifies configured cache thresholds', async () => {
  const { classifyUsage } = await modulePromise;
  const thresholds = { notice: 80, warning: 90, critical: 100 };

  assert.equal(classifyUsage(79.9, thresholds), 'normal');
  assert.equal(classifyUsage(80, thresholds), 'notice');
  assert.equal(classifyUsage(90, thresholds), 'warning');
  assert.equal(classifyUsage(100, thresholds), 'critical');
});

test('groups storage-heavy workflow families deterministically', async () => {
  const { groupStorage } = await modulePromise;
  const groups = groupStorage([
    { name: 'e2e-failure-1-of-4', size: 100 },
    { name: 'e2e-failure-2-of-4', size: 200 },
    { name: 'supabase-docker-v2-Linux-X64', size: 250 },
    { name: 'ubuntu-latest-turbo-e2e-sha', size: 50 },
  ]);

  assert.deepEqual(groups, [
    { family: 'e2e-failure', count: 2, bytes: 300 },
    { family: 'supabase-docker', count: 1, bytes: 250 },
    { family: 'turbo', count: 1, bytes: 50 },
  ]);
});

test('formats binary storage units', async () => {
  const { formatBytes } = await modulePromise;

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KiB');
  assert.equal(formatBytes(10 * 1024 ** 3), '10.00 GiB');
});

test('paginates every cache and artifact page beyond 100 entries', async () => {
  const { paginateGitHubCollection } = await modulePromise;

  for (const property of ['actions_caches', 'artifacts']) {
    const calls = [];
    const values = await paginateGitHubCollection({
      path: `/actions/${property}`,
      property,
      async request(requestPath, query) {
        calls.push({ path: requestPath, query });
        const pageValues =
          query.page === 1
            ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
            : [{ id: 101 }];
        return { [property]: pageValues };
      },
    });

    assert.equal(values.length, 101);
    assert.deepEqual(calls, [
      { path: `/actions/${property}`, query: { page: 1, per_page: 100 } },
      { path: `/actions/${property}`, query: { page: 2, per_page: 100 } },
    ]);
  }
});

test('weekly storage workflow is read-only and needs no billing token', () => {
  const workflowPath = path.join(
    __dirname,
    '..',
    '..',
    '.github',
    'workflows',
    'actions-storage-report.yaml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: "17 6 \* \* 1"/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /\b(?:actions|contents): write\b/);
  assert.match(workflow, /GITHUB_API_VERSION: "2026-03-10"/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(
    workflow,
    /BILLING_TOKEN|ORG_TOKEN|PERSONAL_ACCESS_TOKEN|GH_PAT/
  );
});
