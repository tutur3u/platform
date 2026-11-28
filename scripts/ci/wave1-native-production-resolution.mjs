import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const resolutions = JSON.parse(
  readFileSync(
    new URL('./wave1-native-production-resolutions.json', import.meta.url)
  )
);

/**
 * Match one reviewed record without trusting agreement between external objects.
 * `receiptBaseline*` must equal the baseline the receipt captured; `currentBaseline*`
 * must equal the live rollback read at preflight. Legacy `baseline*` keys never match.
 */
export function matchesFailedNoWriteResolution(
  resolution,
  { env, app, worker, run, job, receipt, rollback }
) {
  const receiptBaseline = [
    { version_id: resolution.receiptBaselineVersionId, percentage: 100 },
  ];
  const currentBaseline = [
    { version_id: resolution.currentBaselineVersionId, percentage: 100 },
  ];
  return (
    resolution.outcome === 'failed-no-write' &&
    env.GITHUB_REPOSITORY === resolution.repository &&
    env.GITHUB_RUN_ID !== resolution.runId &&
    app === resolution.app &&
    receipt.app === app &&
    worker === resolution.worker &&
    receipt.worker === worker &&
    String(run.id) === resolution.runId &&
    String(job.run_id) === resolution.runId &&
    receipt.runId === resolution.runId &&
    String(job.run_attempt) === resolution.runAttempt &&
    receipt.runAttempt === resolution.runAttempt &&
    run.head_sha === resolution.sha &&
    receipt.sha === resolution.sha &&
    receipt.digest === resolution.digest &&
    receipt.state === 'pending' &&
    !Object.hasOwn(receipt, 'versionId') &&
    rollback.id === resolution.currentBaselineDeploymentId &&
    receipt.rollback?.id === resolution.receiptBaselineDeploymentId &&
    isDeepStrictEqual(rollback.versions, currentBaseline) &&
    isDeepStrictEqual(receipt.rollback?.versions, receiptBaseline) &&
    !Object.keys(resolution).some((key) => key.startsWith('baseline'))
  );
}

/** Reviewed append-only resolutions apply to one immutable receipt, never a run range. */
export function isResolvedFailedNoWrite(context) {
  return resolutions.some((resolution) =>
    matchesFailedNoWriteResolution(resolution, context)
  );
}

/**
 * A resolved no-write source or digest is an app-level identity: it must not be
 * hosted by any production Worker that app publishes to, including a Worker
 * whose name differs from the one recorded in the resolution. Only the bypass
 * predicate above is pinned to the recorded Worker. This check stays required
 * for every split-baseline record, so a hosted version blocks admission even
 * when both baselines match.
 */
export function assertResolvedVersionsAbsent({ app, versions }) {
  for (const resolution of resolutions) {
    if (resolution.outcome !== 'failed-no-write' || resolution.app !== app)
      continue;
    for (const version of versions)
      assert.ok(
        version.annotations?.['workers/message'] !== resolution.sha &&
          version.annotations?.['workers/tag'] !== resolution.digest,
        'Resolved no-write source or digest exists in hosted versions; owner reconciliation required'
      );
  }
}
