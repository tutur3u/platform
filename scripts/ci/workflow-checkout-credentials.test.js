const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

// actions/checkout persists the job token in .git/config by default, where any
// later step (dependency install scripts included) can read it. Jobs holding a
// write-scoped token must opt out unless they run authenticated git commands.
const persistedCredentialJobs = new Map([
  [
    'mobile-testflight-review-queue.yaml:dispatch',
    'git fetch origin production',
  ],
  [
    'release-please-auto-merge.yaml:merge',
    'bun git-release-please / git-sync push',
  ],
  ['release-please.yaml:release-please', 'git ls-remote for release branches'],
  // Blob-pinned producer contract for Supabase Production; edit it together
  // with the supabase-production.yaml allowlist.
  ['supabase-staging.yaml:migrate', 'producer contract bytes are pinned'],
]);
// package-release-readiness.js fetches the base ref inside each release gate.
const releaseGate = /^release-[\w-]+-package\.yaml:release-gate$/u;

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

function grantsWrite(permissions) {
  if (permissions === 'write-all') return true;
  return Object.values(permissions ?? {}).includes('write');
}

function persistedCheckouts(all) {
  return Object.entries(all).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {})
      .filter(([, job]) => grantsWrite(job.permissions ?? workflow.permissions))
      .filter(([, job]) =>
        (job.steps ?? []).some(
          (step) =>
            step.uses?.startsWith('actions/checkout@') &&
            step.with?.['persist-credentials'] !== false
        )
      )
      .map(([id]) => `${file}:${id}`)
  );
}

const allowed = (key) =>
  persistedCredentialJobs.has(key) || releaseGate.test(key);

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
  assert.ok(
    [...persisted].filter((key) => releaseGate.test(key)).length >= 10,
    'release gates moved; revisit the release-gate exception'
  );
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
