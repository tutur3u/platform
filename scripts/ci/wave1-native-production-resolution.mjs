import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const resolutions = JSON.parse(
  readFileSync(
    new URL('./wave1-native-production-resolutions.json', import.meta.url)
  )
);

/** Reviewed append-only resolutions apply to one immutable receipt, never a run range. */
export function isResolvedFailedNoWrite({
  env,
  app,
  worker,
  run,
  job,
  receipt,
  rollback,
}) {
  return resolutions.some((resolution) => {
    const baseline = [
      { version_id: resolution.baselineVersionId, percentage: 100 },
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
      rollback.id === resolution.baselineDeploymentId &&
      receipt.rollback?.id === resolution.baselineDeploymentId &&
      isDeepStrictEqual(rollback.versions, baseline) &&
      isDeepStrictEqual(receipt.rollback?.versions, baseline)
    );
  });
}
