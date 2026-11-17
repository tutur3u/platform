import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cfQueueJob,
  recipeDigest,
  RecipeFailure,
  cfPhaseKey,
  payloadDigest,
  runCfPhase,
  stopCfJob,
  submitCfJob,
} from './release-cf-queue.mjs';
const record = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
).apps.finance.releaseRecipe;
const account = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
).accountId;
const grant = {
  jobId: 'job-1',
  attemptId: 'attempt-1',
  workerId: 'approved-worker',
  epoch: 1,
  leaseDeadline: new Date(Date.now() + 3600000).toISOString(),
  targetLockId: 'canonical-lock',
  stopRevision: 0,
};
const input = () => ({
  operationId: 'release-1',
  repository: 'example/platform',
  sourceSha: 'a'.repeat(40),
  recipeSha256: recipeDigest(),
  configSha256: payloadDigest(record),
  requestedPhases: ['publish'],
  artifact: { id: 'sealed-artifact', sha256: 'c'.repeat(64) },
  requirements: {
    os: 'darwin',
    arch: 'arm64',
    toolchain: 'pinned',
    capabilities: ['approved-deploy'],
    cpu: 1,
    ramMiB: 1024,
    diskMiB: 1024,
    maxDurationMs: 60000,
    maxInfrastructureRetries: 0,
  },
  authorizationRefs: ['approval-record'],
  rollback: null,
  provenance: { actor: 'release-owner', owningThread: 'recipe-owner' },
  checkpointRef: null,
});
function authority(
  state = {
    jobs: new Map(),
    receipts: new Map(),
    revision: 0,
    epoch: 1,
    intents: new Set(),
  }
) {
  return {
    state,
    async submit(payload) {
      const digest = payloadDigest(payload);
      const prior = state.jobs.get(payload.operationId);
      assert.ok(!prior || prior.digest === digest, 'Operation conflict');
      const result = prior ?? { jobId: 'job-1', digest };
      state.jobs.set(payload.operationId, result);
      return result;
    },
    async requestStop(jobId, expectedRevision) {
      assert.equal(expectedRevision, state.revision);
      state.revision++;
      return { jobId, stopRevision: state.revision };
    },
    async beginPhase({ grant: current, phaseKey }) {
      assert.equal(current.epoch, state.epoch);
      assert.equal(current.stopRevision, state.revision);
      if (state.offline)
        throw new RecipeFailure(
          'AUTHORITY_UNAVAILABLE',
          'publish',
          'authority'
        );
      if (state.approvalExpired)
        throw new RecipeFailure('APPROVAL_EXPIRED', 'publish', 'approval');
      if (state.lockOwnedByOther)
        throw new RecipeFailure('TARGET_LOCK_CONFLICT', 'publish', 'lock');
      if (state.workerSecretless)
        throw new RecipeFailure('WORKER_INELIGIBLE', 'publish', 'worker');
      const receipt = state.receipts.get(phaseKey);
      assert.ok(
        receipt || !state.intents.has(phaseKey),
        'Original intent requires reconciliation'
      );
      if (!receipt) state.intents.add(phaseKey);
      return { grant: { ...current }, receipt };
    },
    async renew(current) {
      assert.ok(!state.offline);
      assert.equal(current.epoch, state.epoch);
      assert.equal(current.stopRevision, state.revision);
      return { ...current };
    },
    async checkpoint({ phaseKey, receipt }) {
      assert.ok(!state.offline);
      state.receipts.set(phaseKey, structuredClone(receipt));
      return structuredClone(receipt);
    },
  };
}
const successful = async () => ({
  providerOperationId: 'recorded-version',
  verificationRefs: ['readback-sha256'],
});
const job = () => cfQueueJob(structuredClone(record), input());
const run = (port, execute = successful, payload = job(), current = grant) =>
  runCfPhase({
    authority: port,
    payload,
    grant: current,
    phase: payload.requestedPhases[0],
    execute,
  });

export { record, account, grant, input, authority, successful, job, run };
