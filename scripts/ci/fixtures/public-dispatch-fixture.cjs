const assert = require('node:assert/strict');

const source = 'a'.repeat(40);
const control = source;
const main = 'c'.repeat(40);
const blob = 'd'.repeat(40);

function dispatchFixture(stem = 'public-build-artifact') {
  const workflowPath = `.github/workflows/${stem}.yaml`;
  const workflowName =
    stem === 'public-build-artifact'
      ? 'Public build artifact'
      : 'Public merged-main tests';
  const actor = { id: 7, login: 'operator', type: 'User' };
  const triggeringActor = { id: 8, login: 'rerunner', type: 'User' };
  const state = {
    repo: {
      id: 13,
      full_name: 'tutur3u/platform',
      fork: false,
      private: false,
      default_branch: 'main',
    },
    run: {
      id: 1001,
      run_attempt: 2,
      repository: { id: 13 },
      head_repository: { id: 13 },
      event: 'workflow_dispatch',
      head_branch: 'main',
      head_sha: source,
      path: workflowPath,
      name: workflowName,
      workflow_id: 23,
      actor,
      triggering_actor: triggeringActor,
    },
    workflow: {
      id: 23,
      path: workflowPath,
      name: workflowName,
      state: 'active',
    },
    permissions: {
      operator: { permission: 'write', user: actor },
      rerunner: { permission: 'write', user: triggeringActor },
    },
    currentMain: main,
    compare: (ref) => ({ status: 'ahead', merge_base_commit: { sha: ref } }),
    content: () => ({ type: 'file', sha: blob }),
    commit: (ref) => ({ sha: ref }),
  };
  const calls = [];
  const record = (method, callback) => async (params) => {
    calls.push({ method, params });
    assert.equal(params.owner, 'tutur3u');
    assert.equal(params.repo, 'platform');
    return { data: callback(params) };
  };
  const github = {
    rest: {
      repos: {
        get: record('repo', () => state.repo),
        getCollaboratorPermissionLevel: record(
          'permission',
          ({ username }) => state.permissions[username]
        ),
        getBranch: record('branch', ({ branch }) => {
          assert.equal(branch, 'main');
          return { commit: { sha: state.currentMain } };
        }),
        getCommit: record('commit', ({ ref }) => state.commit(ref)),
        compareCommitsWithBasehead: record('compare', ({ basehead }) => {
          const [ref, target] = basehead.split('...');
          assert.equal(target, state.currentMain);
          return state.compare(ref);
        }),
        getContent: record('content', (params) => state.content(params)),
      },
      actions: {
        getWorkflowRun: record('run', ({ run_id }) => {
          assert.equal(run_id, 1001);
          return state.run;
        }),
        getWorkflow: record('workflow', ({ workflow_id }) => {
          assert.equal(workflow_id, state.run.workflow_id);
          return state.workflow;
        }),
      },
    },
  };
  const context = {
    repo: { owner: 'tutur3u', repo: 'platform' },
    payload: { repository: { id: 13 } },
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    sha: source,
    runId: 1001,
    actor: 'operator',
  };
  const options = {
    github,
    context,
    sourceSha: source,
    controlSha: control,
    workflowPath,
    runAttempt: 2,
  };
  return { state, calls, options, context, github };
}

module.exports = { dispatchFixture, source, control, main, blob };
