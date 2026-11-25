// Concurrency contract for automatic wave-1 production publication: builds
// of one app and SHA collapse into one queue, uploads of one app serialize,
// and nothing on the production path cancels a run. Planner callees must not
// share a group, because a replaced pending callee reports "cancelled".
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const publisher = readWorkflow('wave1-native-production.yaml');
const planner = readWorkflow('vercel-production.yaml');
const callers = ['mail', 'calendar', 'apps'].map((app) => ({
  app,
  workflow: readWorkflow(`${app}-cloudflare.yaml`),
}));

function render(source, { github, inputs = {} }) {
  if (typeof source !== 'string') return source;
  return source.replace(/\$\{\{(.*?)\}\}/gu, (_, code) =>
    String(
      vm.runInNewContext(
        // GitHub's `labels.*.name` object filter is not JavaScript.
        code.replaceAll('labels.*.name', 'labelNames'),
        {
          github,
          inputs,
          contains: (items, item) => items.includes(item),
          startsWith: (value, prefix) => value.startsWith(prefix),
          format: (template, ...values) =>
            template.replace(/\{([0-9]+)\}/gu, (__, index) => values[index]),
        },
        { timeout: 100 }
      )
    )
  );
}

function github({ sha = 'a'.repeat(40), run = 1, event = 'push' } = {}) {
  return {
    ref: 'refs/heads/production',
    sha,
    run_id: run,
    run_attempt: 1,
    event_name: event,
    // GitHub hands the caller's name to every callee.
    workflow: 'Production Deployment Planner',
    event: { pull_request: { labelNames: [] } },
  };
}

test('builds of one app and SHA collapse; other SHAs and apps stay apart', () => {
  const { group } = publisher.concurrency;
  const planned = render(group, { github: github(), inputs: { app: 'mail' } });
  const manual = render(group, {
    github: github({ run: 2, event: 'workflow_dispatch' }),
    inputs: { app: 'mail' },
  });
  assert.equal(planned, manual, 'same app and SHA must share one queue');
  assert.notEqual(
    planned,
    render(group, {
      github: github({ sha: 'b'.repeat(40) }),
      inputs: { app: 'mail' },
    }),
    'a newer SHA builds without waiting for an older build'
  );
  assert.notEqual(
    planned,
    render(group, { github: github(), inputs: { app: 'apps' } })
  );
  assert.equal(publisher.concurrency['cancel-in-progress'], false);
  assert.equal(publisher.concurrency.queue, 'max');
});

test('uploads of one app serialize across SHAs and are never cancelled', () => {
  const { concurrency } = publisher.jobs.publish;
  const older = render(concurrency.group, {
    github: github(),
    inputs: { app: 'mail' },
  });
  const newer = render(concurrency.group, {
    github: github({ sha: 'b'.repeat(40), run: 9 }),
    inputs: { app: 'mail' },
  });
  assert.equal(older, newer, 'a newer SHA queues behind an in-flight upload');
  assert.notEqual(
    older,
    render(concurrency.group, { github: github(), inputs: { app: 'apps' } })
  );
  assert.equal(concurrency['cancel-in-progress'], false);
  assert.equal(concurrency.queue, 'max');
});

test('planner callers get a group per run and never cancel on production', () => {
  for (const { app, workflow } of callers) {
    const { group } = workflow.concurrency;
    assert.doesNotMatch(group, /github\.workflow\b/u, app);
    for (const event of ['push', 'workflow_dispatch']) {
      const first = render(group, { github: github({ event }) });
      const next = render(group, {
        github: github({ sha: 'b'.repeat(40), run: 2, event }),
      });
      assert.notEqual(first, next, `${app} ${event}: runs must not collide`);
      assert.equal(
        render(String(workflow.concurrency['cancel-in-progress']), {
          github: github({ event }),
        }),
        'false',
        `${app} ${event}`
      );
    }
  }
});

test('every group reachable from the planner is distinct within one run', () => {
  const groups = new Map();
  const add = (label, source, inputs) => {
    if (!source) return;
    const key = render(source, { github: github(), inputs }).toLowerCase();
    assert.ok(!groups.has(key), `${label} collides with ${groups.get(key)}`);
    groups.set(key, label);
  };
  add('planner', planner.concurrency?.group);
  for (const { app, workflow } of callers) {
    add(`${app}-cloudflare.yaml`, workflow.concurrency.group);
    add(`${app} publisher`, publisher.concurrency.group, { app });
    add(`${app} upload`, publisher.jobs.publish.concurrency.group, { app });
  }
});
