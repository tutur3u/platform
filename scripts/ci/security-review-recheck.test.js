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
