const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  decide,
  independentApprovers,
  main,
  parseReviewers,
} = require('./security-review-classification.js');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const source = (file) => fs.readFileSync(path.join(workflowsDir, file), 'utf8');
const expression = (body) => `\${{ ${body} }}`;
const triggers = (workflow) => workflow.on ?? workflow.true;

const repo = 'example/platform';
const head = 'a'.repeat(40);
const review = (login, state, commit = head) => ({
  commit_id: commit,
  state,
  user: { login, type: 'User' },
});

test('the classifier reports for every pull request without path filters', () => {
  const on = triggers(readWorkflow('security-review-classifier.yaml'));
  assert.deepEqual(Object.keys(on), ['pull_request_target']);
  for (const filter of [
    'paths',
    'paths-ignore',
    'branches',
    'branches-ignore',
  ]) {
    assert.equal(on.pull_request_target[filter], undefined, filter);
  }
  const job = readWorkflow('security-review-classifier.yaml').jobs.classify;
  assert.equal(job.if, undefined);
  // Non-sensitive changes still produce a successful check.
  const clean = decide({
    author: 'mallory',
    files: ['README.md', 'apps/web/src/app/page.tsx'],
    headSha: head,
    reviewers: parseReviewers(''),
    reviews: [],
    truncated: false,
  });
  assert.equal(clean.conclusion, 'success');
});

test('review relay is a permissionless signal without checkout', () => {
  const relay = readWorkflow('security-review-recheck.yaml');
  assert.equal(relay.name, 'Security Review Recheck');
  assert.deepEqual(triggers(relay), {
    pull_request_review: { types: ['submitted', 'dismissed'] },
  });
  assert.deepEqual(relay.permissions, {});
  const jobs = Object.values(relay.jobs);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].permissions, {});
  assert.ok(jobs[0].steps.every((step) => step.uses === undefined));
  assert.doesNotMatch(
    source('security-review-recheck.yaml'),
    /secrets\.|vars\./u
  );
});

test('reclassification runs only default-branch classifier code', () => {
  const workflow = readWorkflow('security-review-reclassify.yaml');
  const on = triggers(workflow);
  assert.deepEqual(Object.keys(on), ['workflow_run']);
  assert.deepEqual(on.workflow_run.workflows, ['Security Review Recheck']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.concurrency.queue, 'max');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.reclassify;
  assert.equal(
    job.if,
    "github.event.workflow_run.event == 'pull_request_review'"
  );
  assert.deepEqual(
    job.permissions,
    readWorkflow('security-review-classifier.yaml').jobs.classify.permissions
  );
  const [checkout, setupNode, classify, ...rest] = job.steps;
  assert.deepEqual(rest, []);
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(
    checkout.with.ref,
    expression('github.event.repository.default_branch')
  );
  assert.equal(checkout.with['persist-credentials'], false);
  assert.deepEqual(checkout.with['sparse-checkout'].trim().split('\n'), [
    'scripts/ci/security-paths.js',
    'scripts/ci/security-review-classification.js',
  ]);
  assert.match(setupNode.uses, /^actions\/setup-node@[0-9a-f]{40}$/u);
  assert.equal(
    classify.run,
    'node scripts/ci/security-review-classification.js'
  );
  // Event fields are lookup keys only; PR number/author/head come from the API.
  assert.equal(classify.env.PR_NUMBER, undefined);
  assert.equal(classify.env.PR_AUTHOR, undefined);
  assert.equal(classify.env.HEAD_SHA, undefined);
  const text = source('security-review-reclassify.yaml');
  assert.doesNotMatch(
    text,
    /secrets\.|uses: \.\/|bun install|npm (?:ci|install)/u
  );
  assert.doesNotMatch(text, /head_sha \}\}\n\s+(?:ref|path):/u);
});

test('a dismissed approval no longer satisfies the review', () => {
  const base = {
    author: 'mallory',
    headSha: head,
    reviewers: parseReviewers('alice'),
  };
  const approved = [review('alice', 'APPROVED')];
  assert.deepEqual(independentApprovers({ ...base, reviews: approved }), [
    'alice',
  ]);
  // GitHub reports a dismissed approval with state DISMISSED.
  assert.deepEqual(
    independentApprovers({ ...base, reviews: [review('alice', 'DISMISSED')] }),
    []
  );
  assert.deepEqual(
    independentApprovers({
      ...base,
      reviews: [...approved, review('alice', 'DISMISSED')],
    }),
    []
  );
  // An unsubmitted draft review never changes the decision.
  assert.deepEqual(
    independentApprovers({
      ...base,
      reviews: [...approved, review('alice', 'PENDING')],
    }),
    ['alice']
  );
});

function mockGitHub(t, { pulls, reviews }) {
  const requests = [];
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (url, init = {}) => {
    const route = String(url).replace('https://api.github.com', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ body, method: init.method ?? 'GET', route });
    let data = [];
    if (route.startsWith(`/repos/${repo}/pulls?`)) data = pulls;
    else if (route.includes('/files?')) {
      data = route.includes('page=1')
        ? [{ filename: '.github/workflows/x.yaml' }]
        : [];
    } else if (route.includes('/reviews?')) {
      data = route.includes('page=1') ? reviews : [];
    } else if (route.endsWith('/labels/security-review-required')) {
      data = { name: 'security-review-required' };
    }
    return {
      json: async () => data,
      ok: true,
      status: 200,
    };
  };
  return requests;
}

function relayEnv(t, overrides = {}) {
  const keys = [
    'GITHUB_REPOSITORY',
    'GITHUB_STEP_SUMMARY',
    'HEAD_SHA',
    'PR_AUTHOR',
    'PR_NUMBER',
    'SECURITY_REVIEWERS',
    'TRIGGER_HEAD_BRANCH',
    'TRIGGER_HEAD_OWNER',
    'TRIGGER_HEAD_SHA',
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repo,
    SECURITY_REVIEWERS: 'alice',
    TRIGGER_HEAD_BRANCH: 'feature/x',
    TRIGGER_HEAD_OWNER: 'contributor',
    TRIGGER_HEAD_SHA: head,
    ...overrides,
  });
}

const openPull = {
  base: { repo: { full_name: repo } },
  head: { sha: head },
  number: 42,
  user: { login: 'mallory' },
};

test('a review relay recomputes the check for the live pull request', async (t) => {
  relayEnv(t);
  const requests = mockGitHub(t, {
    pulls: [openPull],
    reviews: [review('alice', 'APPROVED'), review('alice', 'DISMISSED')],
  });
  t.mock.method(console, 'log', () => {});
  await main();
  assert.match(
    requests[0].route,
    /pulls\?state=open&head=contributor%3Afeature%2Fx&per_page=100$/u
  );
  const check = requests.find((request) =>
    request.route.endsWith('/check-runs')
  );
  assert.equal(check.body.head_sha, head);
  assert.equal(check.body.name, 'Security review');
  // The dismissal withdrew the only approval.
  assert.equal(check.body.conclusion, 'action_required');
});

test('a relay for a moved, foreign or spoofed head posts nothing', async (t) => {
  for (const pulls of [
    [{ ...openPull, head: { sha: 'b'.repeat(40) } }],
    [{ ...openPull, base: { repo: { full_name: 'attacker/platform' } } }],
    [],
  ]) {
    relayEnv(t);
    const requests = mockGitHub(t, { pulls, reviews: [] });
    t.mock.method(console, 'log', () => {});
    await main();
    assert.deepEqual(
      requests.map(({ method }) => method),
      ['GET']
    );
  }
  for (const overrides of [
    { TRIGGER_HEAD_SHA: 'not-a-sha' },
    { TRIGGER_HEAD_OWNER: 'bad/owner' },
    { TRIGGER_HEAD_BRANCH: '' },
  ]) {
    relayEnv(t, overrides);
    const requests = mockGitHub(t, { pulls: [openPull], reviews: [] });
    await assert.rejects(main(), /bad review relay trigger/u);
    assert.deepEqual(requests, []);
  }
});

// Route-table GitHub double: `routes` maps a path (without query) to a
// function of the page number, or to fixed data; POSTs are recorded.
function routedGitHub(t, routes) {
  const requests = [];
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (url, init = {}) => {
    const full = String(url).replace('https://api.github.com', '');
    const [route, query = ''] = full.split('?');
    const page = Number(new URLSearchParams(query).get('page') ?? 1);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const method = init.method ?? 'GET';
    requests.push({ body, method, route: full });
    const handler = method === 'GET' ? routes[route] : {};
    if (handler === undefined)
      return { json: async () => null, ok: false, status: 404 };
    if (handler === 500)
      return { json: async () => null, ok: false, status: 500 };
    const data = typeof handler === 'function' ? handler(page) : handler;
    return { json: async () => data, ok: true, status: 200 };
  };
  return requests;
}

const prRoutes = (reviewsByPage) => ({
  [`/repos/${repo}/pulls/42/files`]: (page) =>
    page === 1 ? [{ filename: '.github/workflows/x.yaml' }] : [],
  [`/repos/${repo}/pulls/42/reviews`]: reviewsByPage,
  [`/repos/${repo}/labels/security-review-required`]: {
    name: 'security-review-required',
  },
});
const posted = (requests) =>
  requests.filter((request) => request.route.endsWith('/check-runs'));

test('reviews beyond the explicit bound never leave an earlier approval authoritative', async (t) => {
  t.mock.method(console, 'log', () => {});
  const filler = (page) =>
    Array.from({ length: 100 }, (_, index) =>
      review(`bot${page}-${index}`, 'COMMENTED')
    );
  const history = (lastPage) => (page) => {
    if (page === 1) return [review('alice', 'APPROVED'), ...filler(1).slice(1)];
    if (page <= 10) return filler(page);
    return page === 11 ? lastPage : [];
  };
  // A change request on page 11 is past the 1000-review bound.
  relayEnv(t, { HEAD_SHA: head, PR_AUTHOR: 'mallory', PR_NUMBER: '42' });
  let requests = routedGitHub(
    t,
    prRoutes(history([review('alice', 'CHANGES_REQUESTED')]))
  );
  await main();
  let [check] = posted(requests);
  assert.equal(check.body.conclusion, 'action_required');
  assert.match(check.body.output.title, /could not be read completely/u);

  // Exactly 1000 reviews (empty probe page) is a complete history.
  relayEnv(t, { HEAD_SHA: head, PR_AUTHOR: 'mallory', PR_NUMBER: '42' });
  requests = routedGitHub(t, prRoutes(history([])));
  await main();
  [check] = posted(requests);
  assert.equal(check.body.conclusion, 'success');
});

test('an unreadable listing records action_required instead of a stale success', async (t) => {
  t.mock.method(console, 'log', () => {});
  relayEnv(t, { HEAD_SHA: head, PR_AUTHOR: 'mallory', PR_NUMBER: '42' });
  const requests = routedGitHub(t, {
    ...prRoutes(500),
    [`/repos/${repo}/pulls/42/files`]: 500,
  });
  await assert.rejects(main(), /failed with 500/u);
  const [check] = posted(requests);
  assert.equal(check.body.conclusion, 'action_required');
  assert.equal(check.body.head_sha, head);
  assert.match(check.body.output.title, /could not be evaluated/u);
});

function sweepRoutes(latestConclusion) {
  return {
    ...prRoutes([review('alice', 'APPROVED'), review('alice', 'DISMISSED')]),
    [`/repos/${repo}/issues`]: (page) =>
      page === 1 ? [{ number: 42, pull_request: {} }, { number: 7 }] : [],
    [`/repos/${repo}/pulls/42`]: { ...openPull, state: 'open' },
    [`/repos/${repo}/commits/${head}/check-runs`]: {
      check_runs: [
        {
          app: { slug: 'github-actions' },
          conclusion: latestConclusion,
          started_at: '2026-10-23T00:00:00Z',
        },
      ],
    },
  };
}

test('the scheduled sweep revokes a stale success without any relay', async (t) => {
  t.mock.method(console, 'log', () => {});
  relayEnv(t, { SECURITY_REVIEW_SWEEP: 'true' });
  let requests = routedGitHub(t, sweepRoutes('success'));
  await main();
  assert.match(
    requests[0].route,
    /issues\?state=open&labels=security-review-required&per_page=100&page=1$/u
  );
  // Only the labeled pull request is evaluated; plain issues are skipped.
  assert.ok(!requests.some(({ route }) => route.includes('/pulls/7')));
  const [check] = posted(requests);
  assert.equal(check.body.conclusion, 'action_required');
  assert.equal(check.body.head_sha, head);

  // An unchanged decision posts nothing.
  relayEnv(t, { SECURITY_REVIEW_SWEEP: 'true' });
  requests = routedGitHub(t, sweepRoutes('action_required'));
  await main();
  assert.deepEqual(posted(requests), []);
});

test('revocation does not depend on the pull-request-owned relay', () => {
  // A pull request can delete or rename security-review-recheck.yaml, so the
  // relay and its workflow_run consumer are a fast path only. Without them a
  // trusted trigger must still recompute the check.
  const names = fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/u.test(file));
  for (const removed of ['security-review-recheck.yaml', null]) {
    const remaining = names.filter((file) => file !== removed);
    const trusted = remaining.filter((file) => {
      const text = source(file);
      if (!text.includes('scripts/ci/security-review-classification.js'))
        return false;
      const on = Object.keys(triggers(readWorkflow(file)));
      // Triggers whose workflow definition the pull request cannot change.
      return on.every((event) =>
        ['pull_request_target', 'schedule'].includes(event)
      );
    });
    assert.deepEqual(trusted.sort(), [
      'security-review-classifier.yaml',
      'security-review-sweep.yaml',
    ]);
  }
  const sweep = readWorkflow('security-review-sweep.yaml');
  assert.deepEqual(Object.keys(triggers(sweep)), ['schedule']);
  assert.doesNotMatch(
    source('security-review-sweep.yaml'),
    /Recheck|workflow_run/u
  );
  const job = sweep.jobs.sweep;
  assert.deepEqual(
    job.permissions,
    readWorkflow('security-review-classifier.yaml').jobs.classify.permissions
  );
  const [checkout, setupNode, classify, ...rest] = job.steps;
  assert.deepEqual(rest, []);
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(
    checkout.with.ref,
    undefined,
    'schedule runs the default branch'
  );
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(setupNode.uses, /^actions\/setup-node@[0-9a-f]{40}$/u);
  assert.equal(classify.env.SECURITY_REVIEW_SWEEP, 'true');
  assert.doesNotMatch(
    source('security-review-sweep.yaml'),
    /secrets\.|uses: \.\/|bun install|npm (?:ci|install)/u
  );
  // Trusted recomputes also run right before automated merges.
  const types = triggers(readWorkflow('security-review-classifier.yaml'))
    .pull_request_target.types;
  for (const type of ['auto_merge_enabled', 'enqueued', 'synchronize']) {
    assert.ok(types.includes(type), type);
  }
});
