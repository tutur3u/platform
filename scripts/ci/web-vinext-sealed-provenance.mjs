import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAMILY,
  familyDirsUnder,
  SealError,
  sha256,
  verifyReceipt,
} from './web-vinext-sealed-artifact.mjs';

// Origin check for sealed vinext family artifacts, run by the publisher
// BEFORE trusting their contents. The sealed verifier proves only that an
// artifact is internally consistent; this proves it came from
// web-vinext-families-build.yaml on main, dispatched for the pin, in a
// successful run, with GitHub's artifact digests and a build provenance
// attestation signed by that workflow at refs/heads/main.
//
//   node scripts/ci/web-vinext-sealed-provenance.mjs <run-id> <sha> <out-dir>
//
// It downloads every artifact zip of the run into <out-dir>, checks each
// digest and attestation, extracts them as <out-dir>/sealed/<family> and
// <out-dir>/sealed/receipt.json, then runs the sealed receipt verifier.
// Exit codes: 0 verified; 2 usage; 10 run (repository, workflow path, event,
// branch, conclusion, workflow commit off main); 11 pin (run title, sha not
// on main/production, seal or receipt bound to another run); 12 artifact
// (missing, extra, expired or digest mismatch); 13 attestation (missing, or
// signer, source ref, source digest or run differ); 14 environment
// (web-vinext-build missing or not restricted to main). Sealed verifier codes
// 3-8 follow (see web-vinext-sealed-artifact.mjs).
export const REPOSITORY = 'tutur3u/platform';
export const WORKFLOW_PATH = '.github/workflows/web-vinext-families-build.yaml';
export const SIGNER_WORKFLOW = `${REPOSITORY}/${WORKFLOW_PATH}`;
export const WORKFLOW_REF = `${SIGNER_WORKFLOW}@refs/heads/main`;
export const ENVIRONMENT = 'web-vinext-build';
export const ARTIFACT_PREFIX = 'web-vinext-sealed-';
export const RECEIPT_ARTIFACT = `${ARTIFACT_PREFIX}receipt`;
export const PROVENANCE_EXIT = Object.freeze({
  ok: 0,
  usage: 2,
  run: 10,
  pin: 11,
  artifact: 12,
  attestation: 13,
  environment: 14,
});

const SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9]\d{0,19}$/u;

const fail = (code, message) => {
  throw new SealError(code, message);
};

/** The run-name the workflow sets; it ties the run to its pin. */
export const runTitle = (sha) => `Web vinext families ${sha}`;

/** Refuses a run that is not this workflow on main, dispatched, green. */
export function checkRun(run, sha) {
  const E = PROVENANCE_EXIT;
  if (run?.repository?.full_name !== REPOSITORY) fail(E.run, 'run repository');
  if (run.head_repository?.full_name !== REPOSITORY) {
    fail(E.run, 'run head repository is a fork');
  }
  if (run.path !== WORKFLOW_PATH && run.path !== `${WORKFLOW_PATH}@refs/heads/main`) {
    fail(E.run, 'run workflow path');
  }
  if (run.event !== 'workflow_dispatch') fail(E.run, 'run event');
  if (run.head_branch !== 'main') fail(E.run, 'run branch is not main');
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    fail(E.run, 'run did not succeed');
  }
  if (!SHA.test(run.head_sha ?? '')) fail(E.run, 'run head sha');
  if (run.display_title !== runTitle(sha)) {
    fail(E.pin, 'run title does not name the pin');
  }
  return run;
}

/** Whether GitHub's comparison shows `base` contained in `head`. */
export function contains(comparison) {
  return comparison?.status === 'ahead' || comparison?.status === 'identical';
}

/** Requires custom branch policies naming only the main branch. */
export function checkEnvironment(environment, policies) {
  const E = PROVENANCE_EXIT;
  const policy = environment?.deployment_branch_policy;
  if (environment?.name !== ENVIRONMENT) fail(E.environment, 'missing');
  if (!policy?.custom_branch_policies || policy.protected_branches) {
    fail(E.environment, `${ENVIRONMENT} is not restricted to main`);
  }
  const names = (policies?.branch_policies ?? []).map(
    (entry) => `${entry.type ?? 'branch'}:${entry.name}`
  );
  if (names.join(',') !== 'branch:main') {
    fail(E.environment, `${ENVIRONMENT} branch policies are not exactly main`);
  }
}

/**
 * The run's sealed artifacts by name: the receipt and at least one family,
 * none expired, each with a sha256 digest. Other artifact names fail.
 */
export function checkArtifacts(list) {
  const E = PROVENANCE_EXIT;
  const artifacts = {};
  for (const artifact of list?.artifacts ?? []) {
    const name = artifact?.name;
    if (
      typeof name !== 'string' ||
      !name.startsWith(ARTIFACT_PREFIX) ||
      (name !== RECEIPT_ARTIFACT &&
        !FAMILY.test(name.slice(ARTIFACT_PREFIX.length)))
    ) {
      fail(E.artifact, `unexpected artifact ${name}`);
    }
    if (artifacts[artifact.name]) fail(E.artifact, `${artifact.name} repeats`);
    if (artifact.expired) fail(E.artifact, `${artifact.name} expired`);
    const digest = /^sha256:([0-9a-f]{64})$/u.exec(artifact.digest ?? '')?.[1];
    if (!digest) fail(E.artifact, `${artifact.name} has no sha256 digest`);
    artifacts[artifact.name] = { id: artifact.id, digest };
  }
  if (!artifacts[RECEIPT_ARTIFACT]) fail(E.artifact, 'receipt artifact missing');
  if (Object.keys(artifacts).length < 2) fail(E.artifact, 'no family artifact');
  return artifacts;
}

/** Checks `gh attestation verify --format json` output against the run. */
export function checkAttestation(results, { runId, headSha }) {
  const E = PROVENANCE_EXIT;
  if (!Array.isArray(results) || results.length === 0) {
    fail(E.attestation, 'no verified attestation');
  }
  const ok = results.some((result) => {
    const cert = result?.verificationResult?.signature?.certificate ?? {};
    return (
      cert.sourceRepositoryRef === 'refs/heads/main' &&
      cert.sourceRepositoryDigest === headSha &&
      cert.buildSignerURI === `https://github.com/${WORKFLOW_REF}` &&
      cert.runnerEnvironment === 'github-hosted' &&
      String(cert.runInvocationURI ?? '').startsWith(
        `https://github.com/${REPOSITORY}/actions/runs/${runId}/attempts/`
      )
    );
  });
  if (!ok) fail(E.attestation, 'attestation does not match this run');
}

/** Every seal and the receipt must name this run and workflow. */
export function checkRunBinding(sealedRoot, runId) {
  const E = PROVENANCE_EXIT;
  const matches = (identity) =>
    identity?.repository === REPOSITORY &&
    String(identity?.runId) === String(runId) &&
    identity?.workflowRef === WORKFLOW_REF;
  const receipt = JSON.parse(
    readFileSync(join(sealedRoot, 'receipt.json'), 'utf8')
  );
  if (!matches(receipt.run)) fail(E.pin, 'receipt names another run');
  const dirs = familyDirsUnder(sealedRoot);
  for (const [family, dir] of Object.entries(dirs)) {
    const seal = JSON.parse(readFileSync(join(dir, 'seal.json'), 'utf8'));
    if (!matches(seal.build)) fail(E.pin, `${family} seal names another run`);
  }
  return dirs;
}

/** Default GitHub CLI runner: JSON by default, raw bytes for downloads. */
export function ghCli(args, { raw = false } = {}) {
  const out = execFileSync('gh', args, {
    encoding: raw ? 'buffer' : 'utf8',
    maxBuffer: 1024 ** 3,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return raw ? out : JSON.parse(out);
}

export function unzipCli(zipPath, dir) {
  execFileSync('unzip', ['-q', zipPath, '-d', dir], { stdio: 'ignore' });
}

/**
 * Fetches and verifies the run's artifacts. `gh` and `unzip` are
 * injectable for tests; nothing is extracted before every digest and
 * attestation passes.
 */
export function verifyProvenance({
  runId,
  sha,
  outDir,
  gh = ghCli,
  unzip = unzipCli,
}) {
  const E = PROVENANCE_EXIT;
  if (!RUN_ID.test(String(runId ?? ''))) fail(E.usage, 'run id is malformed');
  if (!SHA.test(sha ?? '')) fail(E.usage, 'sha must be 40 lowercase hex');
  const out = resolve(outDir);
  if (existsSync(out)) fail(E.usage, 'output directory already exists');
  const api = `repos/${REPOSITORY}`;

  const run = checkRun(gh(['api', `${api}/actions/runs/${runId}`]), sha);
  const compare = (base, head) =>
    contains(gh(['api', `${api}/compare/${base}...${head}`]));
  if (!compare(run.head_sha, 'main')) {
    fail(E.run, 'workflow commit is not on main');
  }
  if (!compare(sha, 'main') && !compare(sha, 'production')) {
    fail(E.pin, 'pin is not on main or production');
  }
  checkEnvironment(
    gh(['api', `${api}/environments/${ENVIRONMENT}`]),
    gh(['api', `${api}/environments/${ENVIRONMENT}/deployment-branch-policies`])
  );
  const artifacts = checkArtifacts(
    gh(['api', `${api}/actions/runs/${runId}/artifacts?per_page=100`])
  );

  mkdirSync(join(out, 'zips'), { recursive: true });
  for (const [name, { id, digest }] of Object.entries(artifacts)) {
    const zip = join(out, 'zips', `${name}.zip`);
    writeFileSync(zip, gh(['api', `${api}/actions/artifacts/${id}/zip`], { raw: true }));
    if (sha256(readFileSync(zip)) !== digest) {
      fail(E.artifact, `${name} zip differs from GitHub's digest`);
    }
    let results;
    try {
      results = gh([
        'attestation',
        'verify',
        zip,
        '--repo',
        REPOSITORY,
        '--signer-workflow',
        SIGNER_WORKFLOW,
        '--source-ref',
        'refs/heads/main',
        '--source-digest',
        run.head_sha,
        '--deny-self-hosted-runners',
        '--format',
        'json',
      ]);
    } catch (error) {
      if (error instanceof SealError) throw error;
      fail(E.attestation, `${name} has no valid attestation`);
    }
    checkAttestation(results, { runId, headSha: run.head_sha });
  }

  const sealedRoot = join(out, 'sealed');
  for (const name of Object.keys(artifacts)) {
    const dir =
      name === RECEIPT_ARTIFACT
        ? sealedRoot
        : join(sealedRoot, name.slice(ARTIFACT_PREFIX.length));
    mkdirSync(dir, { recursive: true });
    try {
      unzip(join(out, 'zips', `${name}.zip`), dir);
    } catch {
      fail(E.artifact, `${name} did not extract cleanly`);
    }
  }
  const dirs = checkRunBinding(sealedRoot, runId);
  const receipt = verifyReceipt(join(sealedRoot, 'receipt.json'), dirs, sha);
  const listed = Object.keys(receipt.families).sort().join(',');
  if (listed !== Object.keys(dirs).sort().join(',')) {
    fail(E.artifact, 'family artifacts differ from the receipt');
  }
  return { sealedRoot, families: Object.keys(receipt.families), run };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [runId, sha, outDir, ...rest] = process.argv.slice(2);
    if (!outDir || rest.length > 0) {
      fail(
        PROVENANCE_EXIT.usage,
        'usage: web-vinext-sealed-provenance.mjs <run-id> <sha> <out-dir>'
      );
    }
    const { sealedRoot, families } = verifyProvenance({ runId, sha, outDir });
    console.log(`verified provenance of ${families.join(', ')} in ${sealedRoot}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error instanceof SealError ? error.code : PROVENANCE_EXIT.usage;
  }
}
