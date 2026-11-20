const { execFileSync } = require('node:child_process');
const { signoffArtifactName } = require('./security-definer-signoff-proof');
const {
  ATTESTATION_CONTEXT,
  ATTESTER,
  REPOSITORY,
  attestationDescription,
  splitLedger,
} = require('./security-definer-admission');

const LEDGER = 'scripts/ci/security-definer-verified-findings.json';

function requireSha(sha) {
  if (typeof sha !== 'string' || sha.length !== 40 || !/^[a-f0-9]+$/.test(sha))
    throw new Error('A full lowercase commit SHA is required.');
}

function validateSignoff({ cwd, main, sha, context, description }) {
  requireSha(main);
  requireSha(sha);
  if (context !== ATTESTATION_CONTEXT)
    throw new Error('Unsupported sign-off context.');

  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    git('cat-file', '-e', `${sha}^{commit}`);
  } catch {
    // Fetch the candidate's objects without ever checking out its files.
    git('fetch', '--no-tags', 'origin', sha);
  }
  if (git('rev-parse', '--verify', `${sha}^{commit}`) !== sha)
    throw new Error('The target SHA must identify a commit object.');
  const base = git('rev-parse', '--verify', `${sha}^1`);
  if (
    base !== main &&
    !git('rev-list', '--first-parent', main, `^${base}`)
      .split('\n')
      .includes(sha)
  ) {
    throw new Error(
      'The target must be on main or directly extend the dispatch revision of main.'
    );
  }

  const readLedger = (ref) => JSON.parse(git('show', `${ref}:${LEDGER}`));
  const { additions, rebinds } = splitLedger(readLedger(base), readLedger(sha));
  if (!additions.length && !rebinds.length)
    throw new Error('No new or rebound verified finding records.');
  const expected = attestationDescription(additions, rebinds);
  if (description !== expected)
    throw new Error(
      `Digest mismatch. The target ledger delta requires "${expected}".`
    );
  return expected;
}

async function publishSignoff(github, { sha, description, runId }) {
  requireSha(sha);
  if (!/^[1-9][0-9]*$/.test(runId) || !Number.isSafeInteger(Number(runId)))
    throw new Error('Invalid sign-off workflow run ID.');
  const [owner, repo] = REPOSITORY.split('/');
  const targetUrl = `https://github.com/${REPOSITORY}/actions/runs/${runId}`;
  const { data: status } = await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha,
    context: ATTESTATION_CONTEXT,
    state: 'success',
    description,
    target_url: targetUrl,
  });
  if (
    status?.state !== 'success' ||
    status.context !== ATTESTATION_CONTEXT ||
    status.description !== description ||
    status.target_url !== targetUrl ||
    status.creator?.login !== ATTESTER.login ||
    status.creator?.id !== ATTESTER.id
  ) {
    throw new Error('GitHub did not confirm the expected sign-off status.');
  }
  return {
    name: signoffArtifactName(status.id, sha, description),
    receipt: {
      sha,
      context: ATTESTATION_CONTEXT,
      description,
      statusId: status.id,
      runId,
    },
  };
}

module.exports = { validateSignoff, publishSignoff };

if (require.main === module) {
  try {
    console.log(
      validateSignoff({
        main: process.env.GITHUB_SHA,
        sha: process.env.SIGNOFF_SHA,
        context: process.env.SIGNOFF_CONTEXT,
        description: process.env.SIGNOFF_DESCRIPTION,
      })
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
