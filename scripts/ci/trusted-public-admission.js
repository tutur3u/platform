const REPOSITORY = 'tutur3u/platform';
const PROFILES = Object.freeze({
  '.github/workflows/public-build-artifact.yaml': {
    name: 'Public build artifact',
    executor: 'scripts/ci/public-build.js',
  },
  '.github/workflows/public-merged-main-tests.yaml': {
    name: 'Public merged-main tests',
    executor: 'scripts/ci/public-test-shard.js',
  },
});

class PublicAdmissionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.phase = 'dispatch-admission';
  }
}

function requireEvidence(condition, code) {
  if (!condition) throw new PublicAdmissionError(code);
}

function exactSha(value) {
  requireEvidence(
    typeof value === 'string' && /^[a-f0-9]{40}$/.test(value),
    'PUBLIC_DISPATCH_SHA'
  );
  return value;
}

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function checkOperator(user, permission) {
  requireEvidence(
    ['User', 'Bot'].includes(user?.type) &&
      positive(user.id) &&
      typeof user.login === 'string' &&
      /^[a-z\d](?:[a-z\d-]{0,38})(?:\[bot\])?$/i.test(user.login),
    'PUBLIC_DISPATCH_OPERATOR'
  );
  requireEvidence(
    permission?.user?.id === user.id &&
      permission.user.login === user.login &&
      permission.user.type === user.type &&
      ['write', 'maintain', 'admin'].includes(permission.permission),
    'PUBLIC_DISPATCH_PERMISSION'
  );
}

async function checkDispatch({
  github,
  context,
  sourceSha,
  controlSha,
  workflowPath,
  runAttempt,
}) {
  exactSha(sourceSha);
  exactSha(controlSha);
  requireEvidence(sourceSha === context.sha, 'PUBLIC_DISPATCH_SOURCE_IDENTITY');
  const profile = PROFILES[workflowPath];
  requireEvidence(
    profile &&
      context.repo.owner === 'tutur3u' &&
      context.repo.repo === 'platform' &&
      context.eventName === 'workflow_dispatch' &&
      context.ref === 'refs/heads/main' &&
      positive(context.runId) &&
      positive(runAttempt),
    'PUBLIC_DISPATCH_CONTEXT'
  );
  const params = context.repo;
  const { data: repo } = await github.rest.repos.get(params);
  requireEvidence(
    repo.full_name === REPOSITORY &&
      positive(repo.id) &&
      repo.id === context.payload?.repository?.id &&
      repo.fork === false &&
      repo.private === false &&
      repo.default_branch === 'main',
    'PUBLIC_DISPATCH_REPOSITORY'
  );
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...params,
    run_id: context.runId,
  });
  requireEvidence(
    run.id === context.runId &&
      run.run_attempt === runAttempt &&
      run.repository?.id === repo.id &&
      run.head_repository?.id === repo.id &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === 'main' &&
      run.head_sha === sourceSha &&
      run.head_sha === controlSha &&
      run.path === workflowPath &&
      run.name === profile.name &&
      positive(run.workflow_id),
    'PUBLIC_DISPATCH_RUN'
  );
  const { data: workflow } = await github.rest.actions.getWorkflow({
    ...params,
    workflow_id: run.workflow_id,
  });
  requireEvidence(
    workflow.id === run.workflow_id &&
      workflow.path === workflowPath &&
      workflow.name === profile.name &&
      workflow.state === 'active',
    'PUBLIC_DISPATCH_WORKFLOW'
  );
  requireEvidence(run.actor?.login === context.actor, 'PUBLIC_DISPATCH_ACTOR');
  for (const user of [run.actor, run.triggering_actor]) {
    requireEvidence(
      typeof user?.login === 'string',
      'PUBLIC_DISPATCH_OPERATOR'
    );
    const { data: permission } =
      await github.rest.repos.getCollaboratorPermissionLevel({
        ...params,
        username: user.login,
      });
    checkOperator(user, permission);
  }
  const { data: branch } = await github.rest.repos.getBranch({
    ...params,
    branch: 'main',
  });
  const main = exactSha(branch.commit?.sha);
  for (const ref of new Set([sourceSha, controlSha])) {
    const { data: commit } = await github.rest.repos.getCommit({
      ...params,
      ref,
    });
    requireEvidence(commit.sha === ref, 'PUBLIC_DISPATCH_COMMIT');
    const { data: comparison } =
      await github.rest.repos.compareCommitsWithBasehead({
        ...params,
        basehead: `${ref}...${main}`,
      });
    requireEvidence(
      ['ahead', 'identical'].includes(comparison.status) &&
        comparison.merge_base_commit?.sha === ref,
      'PUBLIC_DISPATCH_ANCESTRY'
    );
  }
  const policies = [
    workflowPath,
    'scripts/ci/trusted-public-admission.js',
    'scripts/ci/trusted-public-receipts.js',
    'scripts/ci/public-ci.js',
    'scripts/ci/setup-bun-with-backoff.sh',
    profile.executor,
  ];
  for (const path of policies) {
    const { data: control } = await github.rest.repos.getContent({
      ...params,
      path,
      ref: controlSha,
    });
    const { data: current } = await github.rest.repos.getContent({
      ...params,
      path,
      ref: main,
    });
    requireEvidence(
      control.type === 'file' &&
        current.type === 'file' &&
        exactSha(control.sha) === exactSha(current.sha),
      'PUBLIC_DISPATCH_POLICY_DRIFT'
    );
  }
  return {
    qualified: true,
    sourceSHA: sourceSha,
    controlSHA: controlSha,
    mainSHA: main,
    runID: context.runId,
    attempt: runAttempt,
    runner: 'github-hosted',
    attachment: 'held',
  };
}

async function admitDispatch(options) {
  try {
    return await checkDispatch(options);
  } catch (error) {
    if (error instanceof PublicAdmissionError) throw error;
    throw new PublicAdmissionError('PUBLIC_DISPATCH_API');
  }
}

module.exports = { admitDispatch, PublicAdmissionError };
