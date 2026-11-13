import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkMarkerPayload,
  checkProducerAttempt,
  checkProducerIdentity,
  profileConfig,
} from './verify-github-deployment-marker-producer.mjs';

const profile = profileConfig('production-platform');
const source = 'a'.repeat(40);
const repo = 'example/platform';
const server = 'https://github.com';

test('legitimate production marker payload passes contract checks', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
  };
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.workflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  checkMarkerPayload(deployment, payload, profile, source);
  assert.equal(payload.runUrl, runUrl);
});

test('forged workflow file path is rejected', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.workflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const workflow = {
    id: 137637851,
    path: profile.workflowPath,
    name: profile.workflowDisplayName,
  };
  const repository = { id: 101, full_name: repo };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: workflow.id,
    path: '.github/workflows/evil.yaml',
    head_branch: 'production',
    head_sha: source,
    event: 'workflow_call',
    status: 'completed',
    conclusion: 'success',
    repository,
    head_repository: repository,
  };
  assert.throws(
    () => checkProducerIdentity(run, payload, repository, repo, workflow, profile),
    /producer-identity-contract/
  );
});

test('unfinished producer attempt is rejected', () => {
  const runUrl = `${server}/${repo}/actions/runs/301`;
  const payload = {
    sha: source,
    markerKind: 'deployment',
    workflowName: profile.workflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl,
  };
  const run = {
    id: 301,
    run_attempt: 1,
    workflow_id: 137637851,
    path: profile.workflowPath,
    head_branch: 'production',
    head_sha: source,
    event: 'workflow_call',
    status: 'in_progress',
    conclusion: null,
    repository: { id: 101, full_name: repo },
    head_repository: { id: 101, full_name: repo },
  };
  assert.throws(
    () => checkProducerAttempt(run, payload, profile, source),
    /producer-current-attempt-contract/
  );
});

test('encoded sensitive path bytes stay redacted in negative marker contract', () => {
  const deployment = {
    id: 96,
    sha: source,
    ref: source,
    environment: profile.environment,
  };
  const payload = {
    sha: 'b'.repeat(40),
    markerKind: 'deployment',
    workflowName: profile.workflowName,
    refName: profile.refName,
    ref: profile.ref,
    runId: '301',
    runAttempt: '1',
    runUrl: `${server}/${repo}/actions/runs/301`,
  };
  assert.throws(
    () => checkMarkerPayload(deployment, payload, profile, source),
    /marker-source-contract/
  );
});
