// Regressions for the scheduled sweep and per-PR writers:
// - REV-6456-13: a deterministic UTC-hour partition visits every open pull
//   request within 24 scheduled runs, whatever earlier runs did, and the
//   bounded fast path cannot starve it;
// - REV-6456-17: membership comes from changed paths, never the label;
// - REV-6456-16: a writer re-reads head and reviews right before posting, so
//   a stale success can never follow a revocation for the same head;
// - REV-6456-11: the revocation is posted first; lookups and labels are
//   best-effort.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reclassify } = require('./security-review-classification.js');
const {
  callsPerPull,
  fastPathPulls,
  slots,
  sweep,
} = require('./security-review-sweep.js');
const { routedGitHub } = require('./security-review-test-helper');

const repo = 'example/platform';
const sha = (n) => n.toString(16).padStart(40, '0');
const hour = 60 * 60 * 1000;
const day0 = Date.parse('2026-10-23T00:05:00Z');
const review = (login, state, commit) => ({
  commit_id: commit,
  state,
  user: { login, type: 'User' },
});

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

// Unlabeled on purpose: the sweep must not depend on labels.
function pull(number, overrides = {}) {
  return {
    base: { repo: { full_name: repo } },
    head: { sha: sha(number) },
    labels: [],
    number,
    state: 'open',
    updated_at: '2026-10-01T00:00:00Z',
    user: { login: 'mallory' },
    ...overrides,
  };
}

const lastRun = (overrides = {}) => ({
  conclusion: 'success',
  event: 'schedule',
  head_branch: 'main',
  path: '.github/workflows/security-review-sweep.yaml',
  run_started_at: '2026-10-22T23:00:00Z',
  workflow_id: 77,
  ...overrides,
});

// Every pull request touches CI and was approved then dismissed, and its
// latest check is a stale success: each evaluation posts a revocation.
function world(pulls, { files = () => 1, run = lastRun() } = {}) {
  const workflow = `/repos/${repo}/actions/workflows/security-review-sweep.yaml`;
  const routes = {
    [`/repos/${repo}`]: { default_branch: 'main' },
    [workflow]: { id: 77 },
    [`${workflow}/runs`]: { workflow_runs: run ? [run] : [] },
    [`/repos/${repo}/pulls`]: (page) =>
      pulls.slice((page - 1) * 100, page * 100),
  };
  for (const item of pulls) {
    const base = `/repos/${repo}/pulls/${item.number}`;
    const fileCount = files(item);
    routes[base] = item;
    routes[`${base}/files`] =
      typeof fileCount === 'number'
        ? (page) =>
            Array.from(
              {
                length: Math.max(
                  0,
                  Math.min(100, fileCount - (page - 1) * 100)
                ),
              },
              (_, index) => ({ filename: `.github/workflows/x${index}.yaml` })
            )
        : fileCount;
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
          conclusion: 'success',
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
const visited = (requests) =>
  checkPosts(requests).map(({ body }) => Number.parseInt(body.head_sha, 16));

test('every open pull request is visited within 24 scheduled runs', async (t) => {
  quietEnv(t);
  // Every PR looks recently updated, so the fast path is saturated each run.
  const pulls = Array.from({ length: 200 }, (_, index) =>
    pull(index + 1, { updated_at: '2026-10-23T00:00:00Z' })
  );
  const seen = new Set();
  for (let run = 0; run < slots; run += 1) {
    const requests = routedGitHub(t, world(pulls));
    const now = day0 + run * hour;
    const counts = await sweep(repo, { now });
    const slot = new Date(now).getUTCHours();
    const inSlice = visited(requests).filter((n) => n % slots === slot);
    // The whole slice is evaluated before, and regardless of, the fast path.
    assert.equal(inSlice.length, counts.slice);
    assert.ok(counts.fastPath <= fastPathPulls);
    for (const number of visited(requests)) seen.add(number);
  }
  assert.equal(seen.size, 200);
});

test('over-budget and failed slices never block later slices', async (t) => {
  quietEnv(t);
  const pulls = Array.from({ length: 96 }, (_, index) => pull(index + 1));
  // Three consecutive runs whose slices contain huge file lists exhaust the
  // slice budget, then 24 ordinary runs follow.
  const huge = (item) => (item.number % slots < 3 ? 2500 : 1);
  for (let run = 0; run < 3; run += 1) {
    routedGitHub(t, world(pulls, { files: huge }));
    await assert.rejects(
      sweep(repo, { now: day0 + run * hour }),
      /over-budget pull request/u
    );
  }
  const seen = new Set();
  for (let run = 3; run < 3 + slots; run += 1) {
    const requests = routedGitHub(t, world(pulls));
    await sweep(repo, { now: day0 + run * hour });
    for (const number of visited(requests)) seen.add(number);
  }
  assert.equal(seen.size, 96, 'every pull request visited within 24 runs');

  // A fault-injected slice: one PR's file listing fails. It still gets a
  // fail-closed revocation, the run fails, and the next slice is unaffected.
  const failing = world(pulls);
  failing[`/repos/${repo}/pulls/5/files`] = 500;
  let requests = routedGitHub(t, failing);
  await assert.rejects(sweep(repo, { now: day0 + 5 * hour }), /1 failed/u);
  const revoked = checkPosts(requests).find(
    ({ body }) => body.head_sha === sha(5)
  );
  assert.equal(revoked.body.conclusion, 'action_required');
  assert.match(revoked.body.output.title, /could not be evaluated/u);
  // The rest of the failing slice is still evaluated.
  assert.deepEqual(
    visited(requests)
      .filter((n) => n % slots === 5)
      .sort((a, b) => a - b),
    [5, 29, 53, 77]
  );
  requests = routedGitHub(t, world(pulls));
  const next = await sweep(repo, { now: day0 + 6 * hour });
  assert.equal(next.partition, next.slice);
});

test('the fast path is bounded and needs a verified cursor', async (t) => {
  quietEnv(t);
  const pulls = Array.from({ length: 48 }, (_, index) =>
    pull(index + 1, { updated_at: '2026-10-23T00:00:00Z' })
  );
  let requests = routedGitHub(t, world(pulls));
  let counts = await sweep(repo, { now: day0 });
  assert.equal(counts.fastPath, fastPathPulls);
  assert.ok(counts.calls <= 5 + (counts.slice + fastPathPulls) * callsPerPull);
  // The partition posts come first.
  assert.ok(
    visited(requests)
      .slice(0, counts.slice)
      .every((n) => n % slots === 0)
  );

  for (const run of [
    null,
    lastRun({ head_branch: 'feature/x' }),
    lastRun({ workflow_id: 78 }),
    lastRun({ path: '.github/workflows/other.yaml' }),
    lastRun({ event: 'workflow_dispatch' }),
  ]) {
    requests = routedGitHub(t, world(pulls, { run }));
    counts = await sweep(repo, { now: day0 });
    assert.equal(counts.fastPath, 0, JSON.stringify(run));
  }
});

test('membership comes from changed paths, not labels', async (t) => {
  quietEnv(t);
  const pulls = [
    pull(24),
    pull(48, { labels: [{ name: 'security-review-required' }] }),
  ];
  // #48 is labeled but changes nothing sensitive: it gets success.
  const routes = world(pulls);
  routes[`/repos/${repo}/pulls/48/files`] = (page) =>
    page === 1 ? [{ filename: 'README.md' }] : [];
  routes[`/repos/${repo}/commits/${sha(48)}/check-runs`] = {
    check_runs: [
      {
        app: { slug: 'github-actions' },
        conclusion: 'action_required',
        started_at: '2026-10-23T00:00:00Z',
      },
    ],
  };
  const requests = routedGitHub(t, routes);
  await sweep(repo, { now: day0 });
  const byHead = Object.fromEntries(
    checkPosts(requests).map(({ body }) => [
      Number.parseInt(body.head_sha, 16),
      body.conclusion,
    ])
  );
  assert.deepEqual(byHead, { 24: 'action_required', 48: 'success' });
  assert.ok(!requests.some(({ route }) => route.includes('/labels')));
});

test('a stale success can never follow a revocation for the same head', async (t) => {
  quietEnv(t);
  const item = pull(1);
  const target = { author: 'mallory', headSha: sha(1), number: '1' };
  const routes = world([item]);
  // The approval is dismissed while this writer is still evaluating, after it
  // read the file list.
  let dismissed = false;
  routes[`/repos/${repo}/pulls/1/files`] = (page) => {
    dismissed = true;
    return page === 1 ? [{ filename: '.github/workflows/x.yaml' }] : [];
  };
  routes[`/repos/${repo}/pulls/1/reviews`] = (page) =>
    page === 1
      ? [
          review('alice', 'APPROVED', sha(1)),
          ...(dismissed ? [review('alice', 'DISMISSED', sha(1))] : []),
        ]
      : [];
  const requests = routedGitHub(t, routes);
  await reclassify(repo, target);
  const conclusions = checkPosts(requests).map(({ body }) => body.conclusion);
  assert.deepEqual(conclusions, ['action_required']);
  // The reviews read is the last GitHub read before the post.
  const order = requests.map(
    ({ method, route }) => `${method} ${route.split('?')[0]}`
  );
  const post = order.indexOf(`POST /repos/${repo}/check-runs`);
  assert.equal(order[post - 1], `GET /repos/${repo}/pulls/1/reviews`);
  assert.equal(order[post - 2], `GET /repos/${repo}/pulls/1`);

  // A head that moved during evaluation posts nothing: a newer run owns it.
  const moved = world([item]);
  moved[`/repos/${repo}/pulls/1`] = pull(1, { head: { sha: sha(99) } });
  const silent = routedGitHub(t, moved);
  const result = await reclassify(repo, target);
  assert.equal(result.posted, false);
  assert.deepEqual(checkPosts(silent), []);
});

const faultTarget = { author: 'mallory', headSha: sha(1), number: '1' };

test('a failed check lookup still posts the revocation', async (t) => {
  quietEnv(t);
  const routes = world([pull(1)]);
  routes[`/repos/${repo}/commits/${sha(1)}/check-runs`] = 500;
  const requests = routedGitHub(t, routes);
  await reclassify(repo, faultTarget, {
    applyLabels: false,
    onlyIfChanged: true,
  });
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
    const { decision } = await reclassify(repo, faultTarget);
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
    reclassify(repo, faultTarget),
    /check-run post failed with 422/u
  );
});

test('an expensive pull request cannot starve later members of its slot', async (t) => {
  // CodeRabbit 4360337362: the slice shares one budget. #24's huge file list
  // exhausts it, so with a fixed order #72 and #96 would never be visited.
  // The start rotates by UTC day, so each member leads on some day.
  quietEnv(t);
  const pulls = Array.from({ length: 96 }, (_, index) => pull(index + 1));
  const files = (item) => (item.number === 24 ? 2500 : 1);
  const seen = new Set();
  for (let day = 0; day < 4; day += 1) {
    const requests = routedGitHub(t, world(pulls, { files }));
    await sweep(repo, { now: day0 + day * 24 * hour }).catch(() => {});
    for (const number of visited(requests)) {
      if (number % slots === 0) seen.add(number);
    }
  }
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    [24, 48, 72, 96]
  );
});
