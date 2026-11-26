import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fixtureApp, SHA } from './web-vinext-seal.fixture.mjs';
import { sealFamily, writeReceipt } from './web-vinext-seal.mjs';
import { SealError } from './web-vinext-sealed-artifact.mjs';
import {
  ENVIRONMENT,
  PROVENANCE_EXIT,
  REPOSITORY,
  runTitle,
  verifyProvenance,
  WORKFLOW_PATH,
  WORKFLOW_REF,
} from './web-vinext-sealed-provenance.mjs';

const RUN_ID = '4242';
const HEAD = 'c'.repeat(40);
const OTHER_SHA = 'd'.repeat(40);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * One sealed family, its receipt, and a fake GitHub whose answers each test
 * can override: `run`, `compare`, `environment`, `policies`, `artifacts`,
 * `zips`, `attestation`.
 */
function harness(t, overrides = {}) {
  const fixture = fixtureApp(t);
  const identity = {
    repository: REPOSITORY,
    runId: RUN_ID,
    runAttempt: '1',
    workflowRef: WORKFLOW_REF,
  };
  sealFamily({
    appDir: fixture.app,
    family: fixture.family,
    sha: SHA,
    outDir: fixture.out,
    build: overrides.sealBuild ?? identity,
  });
  const receiptPath = join(fixture.root, 'receipt', 'receipt.json');
  writeReceipt({
    sha: SHA,
    familyDirs: { 'api-core': fixture.out },
    outPath: receiptPath,
    run: identity,
  });
  const zips = {
    'web-vinext-sealed-api-core': Buffer.from('zip api-core'),
    'web-vinext-sealed-receipt': Buffer.from('zip receipt'),
    ...overrides.zips,
  };
  const artifacts = overrides.artifacts ?? {
    artifacts: Object.entries(zips).map(([name, bytes], index) => ({
      id: index + 1,
      name,
      expired: false,
      digest: `sha256:${digest(name === 'web-vinext-sealed-api-core' && overrides.tamperZip ? Buffer.from('other') : bytes)}`,
    })),
  };
  const run = {
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
    path: WORKFLOW_PATH,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    display_title: runTitle(SHA),
    run_attempt: 1,
    ...overrides.run,
  };
  const certificate = {
    sourceRepositoryRef: 'refs/heads/main',
    sourceRepositoryDigest: HEAD,
    buildSignerURI: `https://github.com/${WORKFLOW_REF}`,
    runnerEnvironment: 'github-hosted',
    runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/attempts/1`,
    ...overrides.certificate,
  };
  const byId = Object.fromEntries(
    artifacts.artifacts.map((artifact) => [String(artifact.id), artifact.name])
  );
  const gh = (args) => {
    if (args[0] === 'attestation') {
      if (overrides.attestation === 'missing') throw new Error('no attestation');
      return [{ verificationResult: { signature: { certificate } } }];
    }
    const path = args[1];
    if (path.endsWith(`/actions/runs/${RUN_ID}`)) return run;
    if (path.includes('/compare/')) {
      const [base, head] = path.split('/compare/')[1].split('...');
      return { status: overrides.compare?.(base, head) ?? 'ahead' };
    }
    if (path.endsWith('/deployment-branch-policies')) {
      return overrides.policies ?? { branch_policies: [{ name: 'main', type: 'branch' }] };
    }
    if (path.endsWith(`/environments/${ENVIRONMENT}`)) {
      return (
        overrides.environment ?? {
          name: ENVIRONMENT,
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        }
      );
    }
    if (path.includes('/artifacts?')) return artifacts;
    const id = /\/actions\/artifacts\/(\d+)\/zip$/u.exec(path)?.[1];
    if (id) return zips[byId[id]];
    throw new Error(`unexpected gh call ${args.join(' ')}`);
  };
  const unzip = (zipPath, dir) => {
    if (basename(zipPath) === 'web-vinext-sealed-receipt.zip') {
      cpSync(receiptPath, join(dir, 'receipt.json'));
    } else cpSync(fixture.out, dir, { recursive: true });
  };
  return () =>
    verifyProvenance({
      runId: RUN_ID,
      sha: overrides.sha ?? SHA,
      outDir: join(fixture.root, 'verify'),
      gh,
      unzip,
    });
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof SealError, String(error));
    assert.equal(error.code, code, error.message);
    return true;
  });
}

test('a main run with matching digests and attestations verifies', (t) => {
  const { sealedRoot, families } = harness(t)();
  assert.deepEqual(families, ['api-core']);
  const receipt = JSON.parse(readFileSync(join(sealedRoot, 'receipt.json'), 'utf8'));
  assert.equal(receipt.run.runId, RUN_ID);
});

test('a run from another branch, workflow, event or result is refused', (t) => {
  for (const run of [
    { head_branch: 'feature/x' },
    { path: '.github/workflows/copy.yaml' },
    { event: 'push' },
    { conclusion: 'failure' },
    { head_repository: { full_name: 'someone/fork' } },
  ]) {
    assertCode(harness(t, { run }), PROVENANCE_EXIT.run);
  }
  assertCode(
    harness(t, { compare: (base) => (base === HEAD ? 'diverged' : 'ahead') }),
    PROVENANCE_EXIT.run
  );
});

test('a run for another sha, or a pin off main and production, is refused', (t) => {
  assertCode(harness(t, { run: { display_title: runTitle(OTHER_SHA) } }), PROVENANCE_EXIT.pin);
  assertCode(harness(t, { sha: OTHER_SHA }), PROVENANCE_EXIT.pin);
  assertCode(
    harness(t, { compare: (base) => (base === SHA ? 'diverged' : 'ahead') }),
    PROVENANCE_EXIT.pin
  );
  assertCode(
    harness(t, { sealBuild: { repository: REPOSITORY, runId: '1', workflowRef: WORKFLOW_REF } }),
    PROVENANCE_EXIT.pin
  );
});

test('a zip that differs from the GitHub digest is refused', (t) => {
  assertCode(harness(t, { tamperZip: true }), PROVENANCE_EXIT.artifact);
  assertCode(
    harness(t, { zips: { 'web-vinext-sealed-extra': Buffer.from('x') } }),
    PROVENANCE_EXIT.artifact
  );
  assertCode(harness(t, { artifacts: { artifacts: [] } }), PROVENANCE_EXIT.artifact);
});

test('a missing or foreign attestation is refused', (t) => {
  assertCode(harness(t, { attestation: 'missing' }), PROVENANCE_EXIT.attestation);
  for (const certificate of [
    { sourceRepositoryRef: 'refs/heads/feature/x' },
    { sourceRepositoryDigest: OTHER_SHA },
    { runnerEnvironment: 'self-hosted' },
    { runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/1/attempts/1` },
    { buildSignerURI: `https://github.com/${REPOSITORY}/.github/workflows/other.yaml@refs/heads/main` },
  ]) {
    assertCode(harness(t, { certificate }), PROVENANCE_EXIT.attestation);
  }
});

test('an environment open to other branches is refused', (t) => {
  assertCode(
    harness(t, { environment: { name: ENVIRONMENT, deployment_branch_policy: null } }),
    PROVENANCE_EXIT.environment
  );
  assertCode(
    harness(t, {
      policies: {
        branch_policies: [
          { name: 'main', type: 'branch' },
          { name: '*', type: 'branch' },
        ],
      },
    }),
    PROVENANCE_EXIT.environment
  );
});
