const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

// actions/checkout persists the job token in .git/config by default, where any
// later step (dependency install scripts included) can read it. Jobs holding a
// write-scoped token must opt out unless they push with it. Anonymous fetch and
// ls-remote work for this public repository and need no exception.
const persistedCredentialJobs = new Map([
  ['release-please-auto-merge.yaml:merge', 'git push of the release merge'],
  [
    'release-please.yaml:release-please',
    'git push of the normalized release branch',
  ],
]);
// Blob-pinned producer contract for Supabase Production; the workflow_run
// trust fix opts it out together with its allowlist update, so this entry is
// tolerated without the stale-exception check.
const transitionalJobs = new Set(['supabase-staging.yaml:migrate']);

function readAllWorkflows() {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `const dir = process.argv[1];
const out = {};
for (const file of require('node:fs').readdirSync(dir).sort()) {
  if (!/\\.ya?ml$/.test(file)) continue;
  out[file] = Bun.YAML.parse(await Bun.file(dir + '/' + file).text());
}
console.log(JSON.stringify(out));`,
        workflowsDir,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );
}

const workflows = readAllWorkflows();

const scopes = [
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'discussions',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'repository-projects',
  'security-events',
  'statuses',
];
const rank = (level) => ({ read: 1, write: 2 })[level] ?? 0;
// The repository default GITHUB_TOKEN permission is write.
const repositoryDefault = Object.fromEntries(
  scopes.map((scope) => [scope, scope === 'id-token' ? 'none' : 'write'])
);

function expand(permissions) {
  if (permissions === 'write-all' || permissions === 'read-all') {
    const level = permissions.slice(0, -4);
    return Object.fromEntries(scopes.map((scope) => [scope, level]));
  }
  return permissions;
}

// Undeclared permissions inherit: from the repository default for a
// top-level run, or from the caller's grant for a reusable workflow, which
// declared permissions can only narrow.
function effectiveGrant(job, workflow, inherited) {
  const declared = expand(job.permissions ?? workflow.permissions);
  const ceiling = inherited ?? repositoryDefault;
  if (declared === undefined) return ceiling;
  return Object.fromEntries(
    scopes.map((scope) => [
      scope,
      rank(declared[scope]) < rank(ceiling[scope])
        ? (declared[scope] ?? 'none')
        : ceiling[scope],
    ])
  );
}

const grantsWrite = (grant) => Object.values(grant).includes('write');
const localCallee = (job) =>
  typeof job.uses === 'string' && job.uses.startsWith('./.github/workflows/')
    ? job.uses.slice('./.github/workflows/'.length)
    : undefined;

function triggerNames(workflow) {
  const on = workflow.on ?? workflow.true;
  if (typeof on === 'string') return [on];
  return Array.isArray(on) ? on : Object.keys(on ?? {});
}

function persistedCheckouts(all) {
  const found = new Set();
  const visit = (file, inherited, depth = 0) => {
    const workflow = all[file];
    assert.ok(workflow && depth < 5, `cannot resolve ${file}`);
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      const grant = effectiveGrant(job, workflow, inherited);
      const callee = localCallee(job);
      if (callee) {
        visit(callee, grant, depth + 1);
        continue;
      }
      const persisted = (job.steps ?? []).some(
        (step) =>
          step.uses?.startsWith('actions/checkout@') &&
          step.with?.['persist-credentials'] !== false
      );
      if (grantsWrite(grant) && persisted) found.add(`${file}:${id}`);
    }
  };
  for (const [file, workflow] of Object.entries(all)) {
    // Reusable-only workflows are evaluated through their callers.
    if (triggerNames(workflow).some((name) => name !== 'workflow_call')) {
      visit(file, undefined);
    }
  }
  return [...found].sort();
}

const allowed = (key) =>
  persistedCredentialJobs.has(key) || transitionalJobs.has(key);

test('write-token jobs do not persist checkout credentials', () => {
  assert.deepEqual(
    persistedCheckouts(workflows).filter((key) => !allowed(key)),
    []
  );
});

test('persisted-credential exceptions still exist and still need review', () => {
  const persisted = new Set(persistedCheckouts(workflows));
  for (const key of persistedCredentialJobs.keys()) {
    assert.ok(persisted.has(key), `${key} no longer needs an exception`);
  }
});

test('undeclared permissions count as the repository write default', () => {
  const changed = structuredClone(workflows);
  const file = 'codex-plugin.yaml';
  delete changed[file].permissions;
  delete changed[file].jobs.validate.permissions;
  const checkout = changed[file].jobs.validate.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  checkout.with = { ...checkout.with };
  delete checkout.with['persist-credentials'];
  assert.ok(persistedCheckouts(changed).includes(`${file}:validate`));

  // A reusable callee without permissions inherits its caller's write grant.
  const reusable = structuredClone(workflows);
  reusable['callee.yaml'] = {
    on: { workflow_call: null },
    jobs: { work: { steps: [{ uses: 'actions/checkout@x' }] } },
  };
  reusable['caller.yaml'] = {
    on: { push: null },
    permissions: { contents: 'read' },
    jobs: {
      call: {
        permissions: { deployments: 'write' },
        uses: './.github/workflows/callee.yaml',
      },
      readonly: { uses: './.github/workflows/callee.yaml' },
    },
  };
  const keys = persistedCheckouts(reusable);
  assert.ok(keys.includes('callee.yaml:work'));
  delete reusable['caller.yaml'].jobs.call;
  assert.ok(!persistedCheckouts(reusable).includes('callee.yaml:work'));
});

test('credential check flags a write-token job that persists credentials', () => {
  const changed = structuredClone(workflows);
  const job = changed['vercel-production-ai.yaml'].jobs['Deploy-Production'];
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  delete checkout.with['persist-credentials'];
  assert.deepEqual(
    persistedCheckouts(changed).filter((key) => !allowed(key)),
    ['vercel-production-ai.yaml:Deploy-Production']
  );
});
