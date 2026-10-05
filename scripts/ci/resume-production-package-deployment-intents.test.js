const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  fixture,
  sha,
  env,
} = require('./resume-production-package-deployment-test-fixture.js');

function completedBoundRecovery() {
  const f = fixture();
  f.intents.push({
    id: 8,
    sha,
    environment: 'production-package-resume',
    payload: { purpose: 'production-package-resume', sha, plannerRunId: 1 },
  });
  f.runs.push({
    ...f.runs[0],
    id: 2,
    name: 'Production Deployment Planner',
    head_repository: { full_name: env.GITHUB_REPOSITORY },
    event: 'workflow_dispatch',
    display_title: `Production package resume ${sha} intent 8`,
  });
  const api = f.api;
  f.api = async (route, options) => {
    if (route === 'actions/runs/2') return f.runs[1];
    if (route.startsWith('actions/runs/2/jobs?')) return { jobs: f.jobs };
    return api(route, options);
  };
  return f;
}

test('bound completed recovery deferred again can reserve exactly one new intent', async () => {
  const f = completedBoundRecovery();
  f.visible = false;
  assert.equal((await f.run()).reason, 'package versions missing');
  assert.deepEqual(f.intentPosts, []);
  f.visible = true;
  assert.equal((await f.run()).dispatched, true);
  assert.equal(f.posts[0].inputs.resume_intent, '9');
  assert.equal(f.intentPosts[0].payload.plannerRunId, 2);
  assert.equal(
    (await f.run()).reason,
    'durable dispatch intent already exists'
  );
  assert.equal(f.posts.length, 1);
  assert.equal(f.intents.length, 2);
});

for (const [name, change] of [
  [
    'unbound legacy intent',
    (f) => {
      f.runs[1].display_title = `Production package resume ${sha}`;
    },
  ],
  [
    'uncertain dispatch absent from runs',
    (f) => {
      f.runs.pop();
    },
  ],
  [
    'active recovery',
    (f) => {
      f.runs[1].status = 'in_progress';
    },
  ],
  [
    'failed recovery',
    (f) => {
      f.runs[1].conclusion = 'failure';
    },
  ],
  [
    'promoted recovery',
    (f) => {
      f.jobs[0].steps[1].conclusion = 'success';
    },
  ],
  [
    'completed without defer evidence',
    (f) => {
      f.jobs[0].steps[0].conclusion = 'skipped';
    },
  ],
  [
    'wrong repository',
    (f) => {
      f.runs[1].head_repository.full_name = 'fork/repo';
    },
  ],
  [
    'wrong workflow',
    (f) => {
      f.runs[1].name = 'Different planner';
    },
  ],
  [
    'wrong event',
    (f) => {
      f.runs[1].event = 'push';
    },
  ],
  [
    'intent payload SHA mismatch',
    (f) => {
      f.intents[0].payload.sha = 'b'.repeat(40);
    },
  ],
]) {
  test(`${name} never creates another reservation`, async () => {
    const f = completedBoundRecovery();
    change(f);
    assert.equal((await f.run()).dispatched, false);
    assert.deepEqual(f.posts, []);
    assert.deepEqual(f.intentPosts, []);
  });
}

test('bound recovery live attempt drift blocks another intent', async () => {
  const f = completedBoundRecovery();
  const api = f.api;
  f.api = async (route, options) =>
    route === 'actions/runs/2'
      ? { ...f.runs[1], run_attempt: 2 }
      : api(route, options);
  assert.equal((await f.run()).dispatched, false);
  assert.deepEqual(f.intentPosts, []);
});

test('concurrent intent added before reservation blocks dispatch', async () => {
  const f = completedBoundRecovery();
  const api = f.api;
  let reads = 0;
  f.api = async (route, options) => {
    if (route.startsWith('deployments?') && ++reads === 2)
      return [...f.intents, { ...f.intents[0], id: 99 }];
    return api(route, options);
  };
  assert.equal(
    (await f.run()).reason,
    'dispatch intent changed before reservation'
  );
  assert.deepEqual(f.intentPosts, []);
});

test('bound recovery newly promoted during final proof blocks dispatch', async () => {
  const f = completedBoundRecovery();
  const api = f.api;
  let reads = 0;
  f.api = async (route, options) => {
    if (route.startsWith('actions/runs/2/jobs?') && ++reads === 4)
      return {
        jobs: [
          {
            ...f.jobs[0],
            steps: [
              {
                name: 'Promote verified production deployment',
                conclusion: 'success',
              },
            ],
          },
        ],
      };
    return api(route, options);
  };
  assert.equal(
    (await f.run()).reason,
    'dispatch intent changed before reservation'
  );
  assert.deepEqual(f.intentPosts, []);
});

test('planner run-name binds the exact durable reservation input', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/vercel-production.yaml',
    'utf8'
  );
  assert.match(workflow, /resume_intent:/);
  assert.match(
    workflow,
    /format\('Production package resume \{0\} intent \{1\}', inputs.expected_sha, inputs.resume_intent\)/
  );
});
