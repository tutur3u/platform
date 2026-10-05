const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { listPages } = require('./resume-production-package-deployment.js');

const {
  fixture,
  sha,
  env,
} = require('./resume-production-package-deployment-test-fixture.js');

test('published dependency resumes owning deferred planner with exact SHA', async () => {
  const f = fixture();
  assert.equal((await f.run()).dispatched, true);
  assert.deepEqual(f.posts, [
    {
      ref: 'production',
      inputs: { expected_sha: sha, package_resume: 'true', resume_intent: '9' },
    },
  ]);
  assert.equal(f.refs, 3);
});

test('planner completion also resumes when packages finished first', async () => {
  const f = fixture();
  f.event.workflow_run.name = 'Production Deployment Planner';
  f.live.name = 'Production Deployment Planner';
  f.event.workflow_run.event = 'push';
  f.live.event = 'push';
  assert.equal((await f.run()).dispatched, true);
});

for (const [name, change] of [
  [
    'fork completion',
    (f) => {
      f.event.workflow_run.head_repository = { full_name: 'fork/repo' };
    },
  ],
  [
    'nonproduction completion',
    (f) => {
      f.event.workflow_run.head_branch = 'main';
    },
  ],
  [
    'failed completion',
    (f) => {
      f.event.workflow_run.conclusion = 'failure';
    },
  ],
  [
    'untrusted event',
    (f) => {
      f.event.workflow_run.event = 'pull_request';
    },
  ],
  [
    'unknown workflow',
    (f) => {
      f.event.workflow_run.name = f.live.name = 'Other';
    },
  ],
  [
    'live attempt changed',
    (f) => {
      f.live.run_attempt = 2;
    },
  ],
  [
    'live conclusion changed',
    (f) => {
      f.live.conclusion = 'failure';
    },
  ],
  [
    'production moved',
    (f) => {
      f.production = 'b'.repeat(40);
    },
  ],
  [
    'planner active',
    (f) => {
      f.runs[0].status = 'in_progress';
    },
  ],
  [
    'prior resume even if failed',
    (f) => {
      f.runs[0].display_title = `Production package resume ${sha}`;
    },
  ],
  [
    'failed latest planner',
    (f) => {
      f.runs[0].conclusion = 'failure';
    },
  ],
  [
    'no planner',
    (f) => {
      f.runs = [];
    },
  ],
  [
    'platform not deferred',
    (f) => {
      f.jobs[0].steps[0].conclusion = 'skipped';
    },
  ],
  [
    'already promoted',
    (f) => {
      f.jobs[0].steps[1].conclusion = 'success';
    },
  ],
]) {
  test(`${name} never dispatches`, async () => {
    const f = fixture();
    change(f);
    assert.equal((await f.run()).dispatched, false);
    assert.deepEqual(f.posts, []);
  });
}

test('production movement after registry check prevents dispatch', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (...args) => {
    if (args[0] === 'git/ref/heads/production' && f.refs === 1)
      f.production = 'b'.repeat(40);
    return api(...args);
  };
  assert.equal((await f.run()).dispatched, false);
  assert.deepEqual(f.posts, []);
});

test('later-page active planner prevents duplicate dispatch', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) => {
    if (route.includes('/runs?'))
      return {
        workflow_runs: route.endsWith('page=1')
          ? Array.from({ length: 100 }, (_, i) => ({ ...f.runs[0], id: i + 1 }))
          : [{ ...f.runs[0], id: 999, status: 'queued' }],
      };
    return api(route, options);
  };
  assert.equal((await f.run()).reason, 'planner active');
  assert.deepEqual(f.posts, []);
});

test('unreadable or truncated pages fail closed', async () => {
  await assert.rejects(
    listPages(async () => ({}), 'runs', 'workflow_runs'),
    /Unreadable/
  );
  await assert.rejects(
    listPages(
      async () => ({ workflow_runs: Array(100).fill({}) }),
      'runs',
      'workflow_runs'
    ),
    /Incomplete/
  );
});

test('workflow checks production before trusted checkout and planner pins recovery', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/production-package-resume.yaml',
    'utf8'
  );
  assert.ok(
    workflow.indexOf('Verify current production before checkout') <
      workflow.indexOf('uses: actions/checkout')
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /- "Production Deployment Planner"/);
  const planner = fs.readFileSync(
    '.github/workflows/vercel-production.yaml',
    'utf8'
  );
  assert.match(
    planner,
    /inputs\.expected_sha == '' \|\| inputs\.expected_sha == github\.sha/
  );
  assert.match(planner, /Production package resume \{0\}/);
});

test('planner appearing after registry reads prevents duplicate dispatch', async () => {
  const f = fixture();
  const api = f.api;
  let lists = 0;
  f.api = async (route, options) => {
    if (route.includes('/runs?') && ++lists === 2)
      f.runs.push({
        ...f.runs[0],
        id: 2,
        status: 'queued',
      });
    return api(route, options);
  };
  assert.equal((await f.run()).reason, 'planner changed before dispatch');
  assert.deepEqual(f.posts, []);
});

test('API body and request stalls are bounded without another request', async () => {
  const { createApi } = require('./resume-production-package-deployment.js');
  for (const response of [
    null,
    { ok: true, status: 200, json: () => new Promise(() => {}) },
  ]) {
    let requests = 0;
    const api = createApi(
      env,
      async () => {
        requests++;
        return response ?? (await new Promise(() => {}));
      },
      { requestTimeoutMs: 5, totalTimeoutMs: 50 }
    );
    await assert.rejects(api('test'), /request timeout/);
    assert.equal(requests, 1);
  }
});

test('overall API deadline expires before starting any extra call', async () => {
  const { createApi } = require('./resume-production-package-deployment.js');
  let clock = 0;
  let requests = 0;
  const api = createApi(
    env,
    async () => {
      requests++;
      return { ok: true, status: 204 };
    },
    { now: () => clock, totalTimeoutMs: 20 }
  );
  await api('first');
  clock = 20;
  await assert.rejects(api('extra'), /deadline exceeded/);
  assert.equal(requests, 1);
});

test('completion queue retains multiple pending events without cancellation', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/production-package-resume.yaml',
    'utf8'
  );
  assert.match(workflow, /cancel-in-progress: false\n {2}queue: max/);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
});

test('durable intent blocks second completion before run visibility catches up', async () => {
  const f = fixture();
  assert.equal((await f.run()).dispatched, true);
  assert.equal(
    (await f.run()).reason,
    'durable dispatch intent already exists'
  );
  assert.equal(f.posts.length, 1);
  assert.equal(f.intentPosts.length, 1);
  assert.equal(f.runs.length, 1);
  assert.deepEqual(f.intentPosts[0], {
    ref: sha,
    environment: 'production-package-resume',
    task: 'resume:production-package-deployment',
    auto_merge: false,
    required_contexts: [],
    production_environment: false,
    transient_environment: true,
    description: 'Durable planner dispatch intent; not a production deployment',
    payload: { purpose: 'production-package-resume', sha, plannerRunId: 1 },
  });
});

test('uncertain planner POST retains intent and never automatically retries', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) => {
    if (route.endsWith('/dispatches')) {
      f.posts.push(JSON.parse(options.body));
      throw Error('GitHub request timeout; result unknown');
    }
    return api(route, options);
  };
  await assert.rejects(f.run(), /result unknown/);
  assert.equal(f.intents.length, 1);
  assert.equal(
    (await f.run()).reason,
    'durable dispatch intent already exists'
  );
  assert.equal(f.posts.length, 1);
});

test('malformed deployment reservation response never dispatches', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) =>
    route === 'deployments' ? {} : api(route, options);
  await assert.rejects(f.run(), /Unreadable dispatch intent/);
  assert.deepEqual(f.posts, []);
});

test('unreadable intent listing fails closed before any write', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) =>
    route.startsWith('deployments?') ? {} : api(route, options);
  await assert.rejects(f.run(), /Unreadable deployments/);
  assert.deepEqual(f.posts, []);
  assert.deepEqual(f.intentPosts, []);
});

test('uncertain intent creation blocks later completion without planner POST', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) => {
    const response = await api(route, options);
    if (route === 'deployments' && options?.method === 'POST') {
      throw Error('Intent creation response timed out');
    }
    return response;
  };
  await assert.rejects(f.run(), /Intent creation response timed out/);
  assert.equal(f.intents.length, 1);
  assert.equal(
    (await f.run()).reason,
    'durable dispatch intent already exists'
  );
  assert.deepEqual(f.posts, []);
  assert.equal(f.intentPosts.length, 1);
});

for (const conclusion of ['failure', 'success']) {
  test(`same run ID rerun completed with ${conclusion} prevents intent and dispatch`, async () => {
    const f = fixture();
    const api = f.api;
    let lists = 0;
    f.api = async (route, options) => {
      if (route.includes('/runs?') && ++lists === 2)
        return {
          workflow_runs: [
            {
              ...f.runs[0],
              run_attempt: 2,
              conclusion,
            },
          ],
        };
      return api(route, options);
    };
    assert.equal((await f.run()).reason, 'planner changed before dispatch');
    assert.deepEqual(f.intentPosts, []);
    assert.deepEqual(f.posts, []);
  });
}

test('latest planner jobs promoted after snapshot prevent intent and dispatch', async () => {
  const f = fixture();
  const api = f.api;
  let jobs = 0;
  f.api = async (route, options) => {
    if (route.includes('/jobs?') && ++jobs === 2)
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
  assert.equal((await f.run()).reason, 'planner jobs changed before dispatch');
  assert.deepEqual(f.intentPosts, []);
  assert.deepEqual(f.posts, []);
});

test('rerun between fresh jobs and final attempt check prevents intent', async () => {
  const f = fixture();
  const api = f.api;
  f.api = async (route, options) =>
    route === 'actions/runs/1'
      ? { ...f.runs[0], run_attempt: 2 }
      : api(route, options);
  assert.equal(
    (await f.run()).reason,
    'planner attempt changed before dispatch'
  );
  assert.deepEqual(f.intentPosts, []);
  assert.deepEqual(f.posts, []);
});

for (const conclusion of ['failure', 'timed_out', 'cancelled']) {
  test(`completed package ${conclusion} tail rechecks exact registry versions`, async () => {
    const f = fixture();
    f.event.workflow_run.conclusion = f.live.conclusion = conclusion;
    assert.equal((await f.run()).dispatched, true);
    assert.deepEqual(
      f.versionReads.map(({ packageName, packageVersion }) => ({
        packageName,
        packageVersion,
      })),
      [{ packageName: '@tuturuuu/ui', packageVersion: '1.0.0' }]
    );
    const missing = fixture();
    missing.event.workflow_run.conclusion = missing.live.conclusion =
      conclusion;
    missing.visible = false;
    await assert.rejects(
      missing.run(),
      /Package registry visibility deadline exceeded/
    );
    assert.deepEqual(missing.posts, []);
    assert.deepEqual(missing.intentPosts, []);
  });
  test(`planner ${conclusion} completion cannot reserve or dispatch`, async () => {
    const f = fixture();
    f.event.workflow_run.name = f.live.name = 'Production Deployment Planner';
    f.event.workflow_run.conclusion = f.live.conclusion = conclusion;
    assert.equal((await f.run()).dispatched, false);
    assert.deepEqual(f.posts, []);
    assert.deepEqual(f.intentPosts, []);
  });
}

test('workflow permits failed package tails but keeps planner success gating', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/production-package-resume.yaml',
    'utf8'
  );
  assert.match(
    workflow,
    /workflow_run.name != 'Production Deployment Planner' \|\| github.event.workflow_run.conclusion == 'success'/
  );
});

test('last package completion retries missing visibility and transport reads before dispatch', async () => {
  const f = fixture();
  f.event.workflow_run.conclusion = f.live.conclusion = 'failure';
  let attempts = 0;
  let elapsed = 0;
  const result = await f.run({
    now: () => elapsed,
    totalTimeoutMs: 10_000,
    sleep: async (ms) => {
      elapsed += ms;
    },
    versionExists: () => {
      attempts++;
      if (attempts === 1) throw new Error('private registry transport failure');
      return attempts >= 3;
    },
  });
  assert.equal(result.dispatched, true);
  assert.equal(attempts, 3);
  assert.equal(f.intentPosts.length, 1);
  assert.equal(f.posts.length, 1);
});

test('exhausted visibility fails the completion instead of silently deferring', async () => {
  const f = fixture();
  f.visible = false;
  await assert.rejects(
    f.run(),
    /Package registry visibility deadline exceeded/
  );
  assert.deepEqual(f.intentPosts, []);
  assert.deepEqual(f.posts, []);
});
