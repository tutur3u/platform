const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ATTESTATION_CONTEXT,
  ATTESTER,
  attestationDescription,
} = require('./security-definer-admission');

const { validateSignoff, publishSignoff } = require('./release-bot-signoff');
const { signoffArtifactName } = require('./security-definer-signoff-proof');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('dispatch uses the protected main environment and uses a scoped Actions token', () => {
  const workflow = readWorkflow('release-bot-signoff.yaml', { raw: true });
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), [
    'context',
    'description',
    'sha',
  ]);
  assert.ok(Object.values(inputs).every((input) => input.required === true));
  assert.deepEqual(inputs.context.options, [ATTESTATION_CONTEXT]);
  assert.deepEqual(workflow.permissions, {});

  const { signoff } = workflow.jobs;
  assert.match(signoff.if, /github\.ref == 'refs\/heads\/main'/);
  assert.match(signoff.if, /github\.run_attempt == '1'/);
  assert.equal(signoff.environment, 'release-bot-signoff');
  assert.deepEqual(signoff.permissions, {
    contents: 'read',
    statuses: 'write',
  });
  assert.equal(signoff.concurrency['cancel-in-progress'], false);

  const [checkout, validate, publish, artifact] = signoff.steps;
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(validate.run, /node scripts\/ci\/release-bot-signoff\.js/);
  assert.doesNotMatch(JSON.stringify(workflow), /secrets\./);
  assert.match(publish.with.script, /publishSignoff\(github,/);
  assert.equal(publish.with['github-token'], '${{ github.token }}');
  assert.equal(
    publish.env.SIGNOFF_DESCRIPTION,
    '${{ steps.validate.outputs.description }}'
  );
  assert.equal(publish.with.retries, 0);
  assert.equal(artifact.with.name, '${{ steps.post.outputs.artifact }}');
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.notEqual(artifact.with.overwrite, true);
  const guard = readWorkflow('security-checks.yaml', { raw: true }).jobs[
    'definer-guard'
  ];
  assert.equal(guard.permissions.actions, 'read');
  const trustedLoad = guard.steps.find(
    (step) => step.name === 'Load trusted definer guard and baseline'
  );
  assert.match(
    trustedLoad.run,
    /git show "\$BASE_SHA:scripts\/ci\/security-definer-signoff-proof\.js"/
  );
  for (const action of signoff.steps.filter((step) => step.uses)) {
    assert.match(action.uses, /@[0-9a-f]{40}$/);
  }
});

test('validation binds the digest to committed ledger bytes and the main base', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-bot-signoff-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  const ledger = 'scripts/ci/security-definer-verified-findings.json';
  fs.mkdirSync(path.dirname(path.join(cwd, ledger)), { recursive: true });
  const from = { file: 'migration.sql', sourceDigest: 'old' };
  const to = { ...from, sourceDigest: 'new' };
  const commitLedger = (records) => {
    fs.writeFileSync(path.join(cwd, ledger), JSON.stringify(records));
    git('add', ledger);
    git('commit', '-qm', 'ledger update');
    return git('rev-parse', 'HEAD');
  };
  const main = commitLedger([from]);
  const sha = commitLedger([to]);
  const laterMain = commitLedger([to, { file: 'next.sql' }]);
  git('commit', '--allow-empty', '-qm', 'no ledger delta');
  const unchanged = git('rev-parse', 'HEAD');
  git('tag', '-a', '-m', 'annotated', 'candidate', sha);
  const tag = git('rev-parse', 'candidate');
  fs.writeFileSync(path.join(cwd, ledger), '[]');
  const description = attestationDescription([], [{ from, to }]);
  const request = { cwd, main, sha, context: ATTESTATION_CONTEXT, description };
  assert.equal(validateSignoff(request), description);
  assert.equal(validateSignoff({ ...request, main: laterMain }), description);
  assert.throws(
    () => validateSignoff({ ...request, description: 'wrong' }),
    /Digest mismatch/
  );
  assert.throws(
    () => validateSignoff({ ...request, context: 'other' }),
    /context/
  );
  assert.throws(() => validateSignoff({ ...request, sha: sha + '\n' }), /SHA/);
  assert.throws(() => validateSignoff({ ...request, sha: laterMain }), /main/);
  assert.throws(
    () => validateSignoff({ ...request, sha: tag }),
    /commit object/
  );
  assert.throws(
    () => validateSignoff({ ...request, main: laterMain, sha: unchanged }),
    /No new or rebound/
  );
});

test('publication binds a receipt to the exact returned Actions-bot status ID', async () => {
  const statuses = [];
  let creator = { login: ATTESTER.login, id: 1 };
  const sha = 'a'.repeat(40);
  const description = attestationDescription([{ file: 'approved.sql' }]);
  const github = {
    rest: {
      repos: {
        createCommitStatus: async (request) => {
          statuses.push(request);
          return { data: { ...request, id: 57, creator } };
        },
      },
    },
  };
  const request = { sha, description, runId: '42' };
  await assert.rejects(
    () => publishSignoff(github, { ...request, runId: '42/attempts/2' }),
    /Invalid sign-off/
  );
  assert.equal(statuses.length, 0);
  await assert.rejects(
    () => publishSignoff(github, request),
    /did not confirm/
  );
  creator = ATTESTER;
  assert.deepEqual(await publishSignoff(github, request), {
    name: signoffArtifactName(57, sha, description),
    receipt: {
      sha,
      context: ATTESTATION_CONTEXT,
      description,
      statusId: 57,
      runId: '42',
    },
  });
  assert.deepEqual(statuses.at(-1), {
    owner: 'tutur3u',
    repo: 'platform',
    sha,
    context: ATTESTATION_CONTEXT,
    description,
    state: 'success',
    target_url: 'https://github.com/tutur3u/platform/actions/runs/42',
  });
});
