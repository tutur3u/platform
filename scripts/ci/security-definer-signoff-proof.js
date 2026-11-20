const { createHash } = require('node:crypto');

const REPOSITORY = 'tutur3u/platform';
const REPOSITORY_ID = 536896722;
const ATTESTATION_CONTEXT = 'security/definer-record-admission';
const ATTESTER = Object.freeze({ login: 'github-actions[bot]', id: 41898282 });
const SIGNOFF_WORKFLOW = '.github/workflows/release-bot-signoff.yaml';
const SIGNOFF_ENVIRONMENT = Object.freeze({
  name: 'release-bot-signoff',
  id: 27989499818,
});
const SIGNOFF_REVIEWER = Object.freeze({ login: 'vhpx', id: 81307469 });
const RUN_URL = `https://github.com/${REPOSITORY}/actions/runs/`;
const STATUS_PAGES = 10;

function sameIdentity(actual, expected) {
  return actual?.id === expected.id && actual?.login === expected.login;
}

function signoffArtifactName(statusId, head, description) {
  if (!Number.isSafeInteger(statusId) || statusId <= 0)
    throw new Error('Invalid release sign-off status ID.');
  const binding = JSON.stringify([
    statusId,
    head,
    ATTESTATION_CONTEXT,
    description,
  ]);
  return `definer-signoff-${createHash('sha256').update(binding).digest('hex')}`;
}

async function verifyWorkflowProof(read, status, head, expected) {
  const runId =
    typeof status.target_url === 'string' &&
    status.target_url.startsWith(RUN_URL) &&
    status.target_url.slice(RUN_URL.length);
  if (
    typeof runId !== 'string' ||
    !/^[1-9][0-9]*$/.test(runId) ||
    !Number.isSafeInteger(Number(runId))
  )
    throw new Error(
      'Definer record attestation is missing the exact sign-off run URL.'
    );
  const path = `actions/runs/${runId}`;
  const run = await read(`${path}/attempts/1`);
  if (
    run?.id !== Number(runId) ||
    run.run_attempt !== 1 ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    typeof run.head_sha !== 'string' ||
    run.head_sha.length !== 40 ||
    !/^[0-9a-f]+$/.test(run.head_sha) ||
    run.path !== SIGNOFF_WORKFLOW ||
    run.repository?.id !== REPOSITORY_ID ||
    run.head_repository?.id !== REPOSITORY_ID ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    throw new Error(
      'Definer record attestation requires a successful trusted main sign-off workflow.'
    );
  }

  const reviews = await read(`${path}/approvals`);
  if (
    !Array.isArray(reviews) ||
    !reviews.some(
      (review) =>
        review?.state === 'approved' &&
        sameIdentity(review.user, SIGNOFF_REVIEWER) &&
        Array.isArray(review.environments) &&
        review.environments.some(
          (environment) =>
            environment?.id === SIGNOFF_ENVIRONMENT.id &&
            environment.name === SIGNOFF_ENVIRONMENT.name
        )
    )
  ) {
    throw new Error(
      'Definer record attestation requires vhpx approval of the release-bot-signoff environment.'
    );
  }

  // A shared Actions bot identity or a copied target URL does not prove who
  // wrote the status. Artifact creation is scoped to the producing run.
  const name = signoffArtifactName(status.id, head, expected);
  const result = await read(`${path}/artifacts?name=${name}`);
  const artifact = result?.artifacts?.[0];
  if (
    result?.total_count !== 1 ||
    !Array.isArray(result.artifacts) ||
    result.artifacts.length !== 1 ||
    artifact?.name !== name ||
    artifact.expired !== false ||
    artifact.workflow_run?.id !== Number(runId) ||
    artifact.workflow_run.head_sha !== run.head_sha ||
    artifact.workflow_run.head_branch !== run.head_branch ||
    artifact.workflow_run.repository_id !== REPOSITORY_ID ||
    artifact.workflow_run.head_repository_id !== REPOSITORY_ID
  ) {
    throw new Error(
      'Definer record attestation is missing an active receipt for this exact status.'
    );
  }
}

async function verifySignoff({ head, expected, token, fetch }) {
  if (!token)
    throw new Error(
      'Definer record attestation needs GITHUB_TOKEN (statuses and actions: read).'
    );
  if (typeof fetch !== 'function')
    throw new Error('Definer record attestation needs fetch.');

  const read = async (path) => {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/${path}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      throw new Error(
        `Definer record attestation lookup failed: ${error.message}`
      );
    }
  };

  for (let page = 1; page <= STATUS_PAGES; page += 1) {
    const statuses = await read(
      `commits/${head}/statuses?per_page=100&page=${page}`
    );
    if (!Array.isArray(statuses))
      throw new Error(
        'Definer record attestation lookup returned no status list.'
      );
    const status = statuses.find(
      (entry) => entry?.context === ATTESTATION_CONTEXT
    );
    if (status) {
      if (status.state !== 'success' || !sameIdentity(status.creator, ATTESTER))
        throw new Error(
          `Definer record attestation on ${head} is not a success from ${ATTESTER.login}.`
        );
      if (status.description !== expected)
        throw new Error(
          `Definer record attestation does not cover exactly the new records (expected "${expected}").`
        );
      await verifyWorkflowProof(read, status, head, expected);
      return expected;
    }
    if (statuses.length < 100) break;
  }
  throw new Error(
    `Missing ${ATTESTATION_CONTEXT} status on ${head}; expected "${expected}".`
  );
}

module.exports = {
  ATTESTATION_CONTEXT,
  ATTESTER,
  REPOSITORY,
  REPOSITORY_ID,
  SIGNOFF_ENVIRONMENT,
  SIGNOFF_REVIEWER,
  SIGNOFF_WORKFLOW,
  signoffArtifactName,
  verifySignoff,
};
