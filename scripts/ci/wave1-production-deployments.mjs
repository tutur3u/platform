// Cloudflare deployment writes for the wave-1 production publisher. Each
// write names its exact version split and is confirmed by reading the active
// deployment back, retrying briefly because the listing can lag a write.
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canonicalDeploymentId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id) ? id.toLowerCase() : id;
}

export function splitOf(versions) {
  return (versions ?? []).map(({ version_id, percentage }) => ({
    version_id,
    percentage,
  }));
}

export function sameSplit(actual, expected) {
  const shape = (list) =>
    JSON.stringify(
      splitOf(list)
        .map(({ version_id, percentage }) => [canonicalDeploymentId(version_id), percentage])
        .sort()
    );
  return shape(actual) === shape(expected);
}

/** The active deployment's version split. */
export async function activeSplit({ script, token, request }) {
  const active = await request(`${script}/deployments`, token);
  assert.equal(active.success, true, 'Deployment read failed');
  return splitOf(active.result?.deployments?.[0]?.versions);
}

/** Fails unless the active deployment is exactly `expected`. */
export async function expectActive({ script, token, request, expected, why }) {
  assert.ok(
    sameSplit(await activeSplit({ script, token, request }), expected),
    why
  );
}

/** Writes a deployment with exactly `versions` and confirms it is active. */
export async function deployVersions({
  script,
  token,
  request,
  versions,
  sleep = wait,
  readbacks = 4,
  readbackDelayMs = 2_000,
}) {
  const split = splitOf(versions);
  assert.ok(
    split.length > 0 &&
      split.reduce((sum, { percentage }) => sum + percentage, 0) === 100,
    'A deployment must name versions totalling 100%'
  );
  const created = await request(`${script}/deployments`, token, {
    strategy: 'percentage',
    versions: split,
  });
  assert.equal(created.success, true, 'Deployment was not created');
  for (let attempt = 1; ; attempt += 1) {
    if (sameSplit(await activeSplit({ script, token, request }), split)) return;
    assert.ok(
      attempt < readbacks,
      'Written deployment is not the active deployment'
    );
    await sleep(readbackDelayMs);
  }
}

/** Another writer changed the deployment; this attempt wrote nothing. */
export class ConcurrentDeploymentError extends Error {
  constructor(active, why) {
    super(
      `${why}: the active deployment is not one this attempt wrote; nothing was written`
    );
    this.name = 'ConcurrentDeploymentError';
    this.active = active;
  }
}

/**
 * Writes `versions` only while the active deployment is exactly one of the
 * splits this attempt wrote (`owned`), so a hand hotfix or rollback that is
 * already active is not overwritten. Cloudflare has no compare-and-swap for
 * deployments: a hand deploy that lands between this read and the write (one
 * API round-trip) is still replaced, and the readback then shows this split.
 * That window is accepted because the alternative, writing without the
 * check, overwrites every concurrent change. Returns 'already' when the
 * target already serves, 'written' after a confirmed write, and throws
 * ConcurrentDeploymentError otherwise.
 */
export async function guardedDeploy({
  script,
  token,
  request,
  versions,
  owned,
  why,
  sleep,
}) {
  const active = await activeSplit({ script, token, request });
  if (sameSplit(active, versions)) return 'already';
  if (!owned.some((split) => sameSplit(active, split)))
    throw new ConcurrentDeploymentError(active, why);
  await deployVersions({ script, token, request, versions, sleep });
  return 'written';
}
