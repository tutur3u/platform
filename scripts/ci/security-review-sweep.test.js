// Regressions for REV-6456-10 (the sweep eventually covers every labeled open
// pull request under a call budget, incrementally) and REV-6456-11 (the
// revocation is posted first; check lookup and labeling are best-effort).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reclassify } = require('./security-review-classification.js');
const { hourMs, rotationSlots, sweep } = require('./security-review-sweep.js');
const { routedGitHub } = require('./security-review-test-helper');

const repo = 'example/platform';
const sha = (n) => n.toString(16).padStart(40, '0');
const review = (login, state, commit) => ({
  commit_id: commit,
  state,
  user: { login, type: 'User' },
});
const labeled = [{ name: 'security-review-required' }];

function quietEnv(t) {
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
  });
  Object.assign(process.env, { SECURITY_REVIEWERS: 'alice' });
  Reflect.deleteProperty(process.env, 'GITHUB_STEP_SUMMARY');
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
}

function pull(number, overrides = {}) {
  return {
    base: { repo: { full_name: repo } },
    head: { sha: sha(number) },
    labels: labeled,
    number,
    updated_at: '2026-10-23T00:00:00Z',
    user: { login: 'mallory' },
    ...overrides,
  };
}

// Every pull request touches CI, was approved and then dismissed, and its
// latest check is a stale success: each evaluation must post a revocation.
// `lastSweep` is the start of the last successful scheduled sweep (cursor).
function world(pulls, { checkConclusion = 'success', lastSweep } = {}) {
  const routes = {
    [`/repos/${repo}/actions/workflows/security-review-sweep.yaml/runs`]: {
      workflow_runs: lastSweep
        ? [{ run_started_at: new Date(lastSweep).toISOString() }]
        : [],
    },
    [`/repos/${repo}/pulls`]: (page) =>
      pulls.slice((page - 1) * 100, page * 100),
  };
  for (const item of pulls) {
    const base = `/repos/${repo}/pulls/${item.number}`;
    routes[`${base}/files`] = (page) =>
      page === 1 ? [{ filename: '.github/workflows/x.yaml' }] : [];
    routes[`${base}/reviews`] = (page) =>
      page === 1
        ? [
            review('alice', 'APPROVED', item.head.sha),
            review('alice', 'DISMISSED', item.head.sha),
          ]
        : [];
    routes[`/repos/${repo}/commits/${item.head.sha}/check-runs`] = {
      check_runs: [
        {
          app: { slug: 'github-actions' },
          conclusion: checkConclusion,
          started_at: '2026-10-23T00:00:00Z',
        },
      ],
    };
  }
  return routes;
}

const checkPosts = (requests) =>
  requests.filter(
    ({ method, route }) => method === 'POST' && route.endsWith('/check-runs')
  );

const swept = (requests) =>
  checkPosts(requests).map(({ body }) => Number.parseInt(body.head_sha, 16));
const at = (iso) => Date.parse(iso);

test('changed labeled pull requests are revoked; issues and others are skipped', async (t) => {
  quietEnv(t);
  const cursor = at('2026-10-23T10:00:00Z');
  const now = at('2026-10-23T11:05:00Z');
  const slot = Math.floor(now / hourMs) % rotationSlots;
  // Pick numbers outside the current rotation slot so only "changed" counts.
  const off = (n) => (n % rotationSlots === slot ? n + 1 : n);
  const changed = pull(off(1), { updated_at: '2026-10-23T10:30:00Z' });
  const stale = pull(off(3), { updated_at: '2026-10-22T09:00:00Z' });
  const pulls = [
    changed,
    stale,
    // Unlabeled and foreign-base pull requests are never visited.
    pull(off(5), { labels: [], updated_at: '2026-10-23T10:30:00Z' }),
    pull(off(7), {
      base: { repo: { full_name: 'attacker/platform' } },
      updated_at: '2026-10-23T10:30:00Z',
    }),
  ];
  const requests = routedGitHub(t, world(pulls, { lastSweep: cursor }));
  const counts = await sweep(repo, { now });
  assert.deepEqual(swept(requests), [changed.number]);
  assert.equal(counts.changed, 1);
  assert.equal(counts.rotated, 0);
  for (const skipped of pulls.slice(1)) {
    assert.ok(
      !requests.some(({ route }) =>
        route.startsWith(`/repos/${repo}/pulls/${skipped.number}/`)
      ),
      `#${skipped.number} must not be evaluated`
    );
  }
  for (const { body } of checkPosts(requests)) {
    assert.equal(body.conclusion, 'action_required');
  }
});

test('the hourly rotation re-evaluates every unchanged labeled pull request', async (t) => {
  quietEnv(t);
  // updated_at never moves (for example a dismissal that does not bump it).
  const pulls = Array.from({ length: 60 }, (_, index) =>
    pull(index + 1, { updated_at: '2026-10-01T00:00:00Z' })
  );
  const cursor = at('2026-10-23T00:00:00Z');
  const visited = new Set();
  for (let hour = 0; hour < rotationSlots; hour += 1) {
    const now = cursor + (hour + 1) * hourMs;
    const requests = routedGitHub(t, world(pulls, { lastSweep: cursor }));
    const counts = await sweep(repo, { now });
    assert.equal(counts.changed, 0);
    for (const number of swept(requests)) visited.add(number);
  }
  assert.equal(visited.size, 60, 'every labeled pull request was revisited');
});

test('a run over budget fails so the cursor keeps the backlog', async (t) => {
  quietEnv(t);
  const pulls = Array.from({ length: 30 }, (_, index) =>
    pull(index + 1, { updated_at: '2026-10-23T10:30:00Z' })
  );
  const requests = routedGitHub(
    t,
    world(pulls, { lastSweep: at('2026-10-23T10:00:00Z') })
  );
  await assert.rejects(
    sweep(repo, { budget: 25, now: at('2026-10-23T11:05:00Z') }),
    /deferred .*resumes from the previous cursor/u
  );
  // Oldest change first, within budget plus at most one pull request.
  const calls = requests.filter(({ method }) => method === 'GET').length;
  assert.ok(calls <= 25 + 4, `used ${calls}`);
  assert.ok(swept(requests).length > 0);
});

test('without a previous successful sweep every labeled pull request is evaluated', async (t) => {
  quietEnv(t);
  const pulls = [pull(1), pull(2), pull(3)];
  const requests = routedGitHub(t, world(pulls));
  const counts = await sweep(repo, { now: at('2026-10-23T11:05:00Z') });
  assert.equal(counts.changed, 3);
  assert.deepEqual(swept(requests).sort(), [1, 2, 3]);
});

test('an unchanged decision posts nothing', async (t) => {
  quietEnv(t);
  const requests = routedGitHub(
    t,
    world([pull(1)], { checkConclusion: 'action_required' })
  );
  await sweep(repo, { now: at('2026-10-23T11:05:00Z') });
  assert.deepEqual(checkPosts(requests), []);
});

test('the sweep refuses to silently truncate the open pull request list', async (t) => {
  quietEnv(t);
  routedGitHub(t, {
    [`/repos/${repo}/pulls`]: (page) =>
      Array.from({ length: 100 }, (_, index) =>
        pull(page * 100 + index, { labels: [] })
      ),
  });
  await assert.rejects(sweep(repo, {}), /more than 3000 open pull requests/u);
});

const target = { author: 'mallory', headSha: sha(1), number: '1' };

test('a failed check lookup still posts the revocation', async (t) => {
  quietEnv(t);
  const routes = world([pull(1)]);
  routes[`/repos/${repo}/commits/${sha(1)}/check-runs`] = 500;
  const requests = routedGitHub(t, routes);
  await reclassify(repo, target, { applyLabels: false, onlyIfChanged: true });
  const [check] = checkPosts(requests);
  assert.equal(check.body.conclusion, 'action_required');
  assert.equal(check.body.head_sha, sha(1));
});

test('a failed label write never suppresses the revocation', async (t) => {
  quietEnv(t);
  for (const routes of [
    // The label lookup fails.
    {
      ...world([pull(1)]),
      [`/repos/${repo}/labels/security-review-required`]: 500,
    },
    // The label lookup works but adding it to the pull request fails.
    {
      ...world([pull(1)]),
      [`/repos/${repo}/labels/security-review-required`]: { name: 'x' },
    },
  ]) {
    const requests = routedGitHub(t, routes, {
      posts: { [`/repos/${repo}/issues/1/labels`]: 500 },
    });
    const { decision } = await reclassify(repo, target);
    assert.equal(decision.conclusion, 'action_required');
    const posts = requests.filter(({ method }) => method === 'POST');
    // The check is the first write, before any label attempt.
    assert.match(posts[0].route, /\/check-runs$/u);
    assert.equal(posts[0].body.conclusion, 'action_required');
  }
});

test('a rejected check post fails the run instead of passing silently', async (t) => {
  quietEnv(t);
  routedGitHub(t, world([pull(1)]), {
    posts: { [`/repos/${repo}/check-runs`]: 422 },
  });
  await assert.rejects(
    reclassify(repo, target),
    /check-run post failed with 422/u
  );
});
