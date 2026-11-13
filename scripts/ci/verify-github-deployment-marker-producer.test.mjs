import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkCallerProducerAttempt,
  checkCallerProducerIdentity,
  checkCalleeProducerAttempt,
  checkMarkerCreator,
  checkMarkerPayload,
  profileConfig,
} from './verify-github-deployment-marker-producer.mjs';

const profile = profileConfig('production-platform');
const source = 'a'.repeat(40);
const repo = 'example/platform';
const server = 'https://github.com';
const repository = { id: 101, full_name: repo };
const callerWorkflow = {
  id: 137637850,
  path: profile.callerWorkflowPath,
  name: profile.callerWorkflowDisplayName,
};
const calleeWorkflow = {
  id: 137637851,
  path: profile.calleeWorkflowPath,
  name: profile.calleeWorkflowDisplayName,
};

test('legitimate production marker payload passes contract checks', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
    creator: profile.trustedDeploymentCreator,
  };
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  checkMarkerPayload(deployment, payload, profile, source);
  assert.equal(payload.runUrl, runUrl);
});

test('forged deployment creator is rejected', () => {
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
    creator: { login: 'evil', id: 1, type: 'User' },
  };
  assert.throws(
    () => checkMarkerCreator(deployment, profile.trustedDeploymentCreator),
    /marker-creator-contract/
  );
});

test('caller run must match production planner workflow path', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: callerWorkflow.id,
    path: '.github/workflows/evil.yaml',
    head_branch: 'production',
    head_sha: source,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () =>
      checkCallerProducerIdentity(
        run,
        payload,
        repository,
        repo,
        callerWorkflow,
        profile
      ),
    /producer-identity-contract/
  );
});

test('callee workflow_call producer must match platform head and ref', () => {
  const run = {
    id: 501,
    run_attempt: 1,
    workflow_id: calleeWorkflow.id,
    path: profile.calleeWorkflowPath,
    head_branch: 'main',
    head_sha: source,
    event: 'workflow_call',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () => checkCalleeProducerAttempt(run, profile, source),
    /callee-producer-contract/
  );
});

test('standalone workflow_dispatch on platform path is rejected as caller', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.markerWorkflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: calleeWorkflow.id,
    path: profile.calleeWorkflowPath,
    head_branch: 'production',
    head_sha: source,
    event: 'workflow_call',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () =>
      checkCallerProducerIdentity(
        run,
        payload,
        repository,
        repo,
        callerWorkflow,
        profile
      ),
    /producer-identity-contract/
  );
  assert.throws(
    () => checkCallerProducerAttempt(run, profile, source),
    /producer-current-attempt-contract|producer-identity-contract/
  );
});
