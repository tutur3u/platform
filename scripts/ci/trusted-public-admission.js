const REPOSITORY = 'tutur3u/platform';
const WORKFLOWS = ['public-merged-main-tests', 'public-build-artifact'].map(
  (name) => `.github/workflows/${name}.yaml`
);
const LABEL = 'ttr-trusted-studio';
function requireEvidence(condition, reason) {
  if (!condition) throw new Error(`Trusted public admission denied: ${reason}`);
}
function exactSha(value) {
  requireEvidence(
    typeof value === 'string' &&
      value.length === 40 &&
      /^[a-f0-9]{40}$/.test(value),
    'immutable SHA'
  );
  return value;
}
function repository(repo) {
  requireEvidence(
    repo?.full_name === REPOSITORY &&
      Number.isSafeInteger(repo.id) &&
      repo.id > 0 &&
      repo.fork === false &&
      repo.private === false &&
      repo.default_branch === 'main',
    'canonical public default-branch policy'
  );
}
function identity(user, permission, operator = false) {
  requireEvidence(
    user?.type === 'User' &&
      Number.isSafeInteger(user.id) &&
      user.id > 0 &&
      /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user.login),
    'human actor identity'
  );
  requireEvidence(
    permission?.user?.id === user.id &&
      permission.user.login === user.login &&
      (operator
        ? ['write', 'maintain', 'admin']
        : ['read', 'triage', 'write', 'maintain', 'admin']
      ).includes(permission.permission),
    'fresh collaborator identity and permission'
  );
}
// Candidate policy only: callers must supply fresh GitHub API records, never PR inputs.
// No result from this module authorizes runner attachment.
function assessPullRequest({ repo, pr, actor, permission, expectedSha }) {
  repository(repo);
  exactSha(expectedSha);
  requireEvidence(
    pr?.base?.repo?.id === repo.id &&
      pr.base.repo.full_name === REPOSITORY &&
      pr?.head?.repo?.id === repo.id &&
      pr.head.repo.full_name === REPOSITORY &&
      pr.head.repo.fork === false,
    'same repository source'
  );
  requireEvidence(
    pr.head.sha === expectedSha &&
      pr.base.ref === 'main' &&
      pr.state === 'open',
    'current immutable PR head and base'
  );
  requireEvidence(
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pr.author_association),
    'trusted author association'
  );
  identity(actor, permission);
  return {
    qualified: true,
    selfHosted: false,
    label: LABEL,
    reason: 'attachment-held',
  };
}
async function admitDispatch({
  github,
  context,
  sourceSha,
  controlSha,
  workflowPath,
}) {
  exactSha(sourceSha);
  exactSha(controlSha);
  requireEvidence(
    context.repo.owner === 'tutur3u' &&
      context.repo.repo === 'platform' &&
      context.eventName === 'workflow_dispatch' &&
      context.ref === 'refs/heads/main' &&
      WORKFLOWS.includes(workflowPath),
    'canonical manual workflow'
  );
  const params = context.repo;
  const { data: repo } = await github.rest.repos.get(params);
  repository(repo);
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...params,
    run_id: context.runId,
  });
  requireEvidence(
    run.id === context.runId &&
      run.repository?.id === repo.id &&
      run.head_repository?.id === repo.id &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === 'main' &&
      run.head_sha === controlSha &&
      run.path === workflowPath,
    'repository run identity'
  );
  requireEvidence(
    run.actor?.login === context.actor,
    'actor matches run record'
  );
  for (const user of [run.actor, run.triggering_actor]) {
    requireEvidence(typeof user?.login === 'string', 'operator record');
    const { data: permission } =
      await github.rest.repos.getCollaboratorPermissionLevel({
        ...params,
        username: user.login,
      });
    identity(user, permission, true);
  }
  const { data: branch } = await github.rest.repos.getBranch({
    ...params,
    branch: 'main',
  });
  const main = exactSha(branch.commit?.sha);
  for (const ref of [sourceSha, controlSha]) {
    const { data: commit } = await github.rest.repos.getCommit({
      ...params,
      ref,
    });
    requireEvidence(commit.sha === ref, 'repository commit record');
    const { data: comparison } =
      await github.rest.repos.compareCommitsWithBasehead({
        ...params,
        basehead: `${ref}...${main}`,
      });
    requireEvidence(
      ['ahead', 'identical'].includes(comparison.status) &&
        comparison.merge_base_commit?.sha === ref,
      'merged main ancestry'
    );
  }
  for (const path of [workflowPath, 'scripts/ci/trusted-public-admission.js']) {
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
      'workflow/default-branch policy drift'
    );
  }
  return {
    qualified: true,
    selfHosted: false,
    label: LABEL,
    reason: 'attachment-held',
  };
}
module.exports = { assessPullRequest, admitDispatch, LABEL };
