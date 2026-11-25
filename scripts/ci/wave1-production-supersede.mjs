// Decides whether a production attempt for `sha` may replace the version
// serving now. An older SHA never downgrades a newer one: it stops as
// superseded before any write. When the serving SHA cannot be proven, from
// the version's own annotation or from the accepted receipt of the earlier
// upload that wrote it, the attempt refuses instead of guessing.
import assert from 'node:assert/strict';
import { boundedJson } from './wave1-native-publish.mjs';

const fullSha = /^[a-f0-9]{40}$/;

/** The id of the single version serving 100%, or null for a split. */
export function servingVersionId(deployment) {
  const serving = deployment?.versions;
  if (!Array.isArray(serving) || serving.length !== 1) return null;
  return serving[0].percentage === 100 ? serving[0].version_id : null;
}

/** The source SHA a version was published from, when it is annotated. */
export function annotatedSourceSha(version) {
  const message = version?.annotations?.['workers/message'];
  return typeof message === 'string' && fullSha.test(message) ? message : null;
}

/** GitHub's compare status of head against base. */
export async function sourceRelation({ env, base, head, fetcher }) {
  const comparison = await boundedJson(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/compare/${base}...${head}?per_page=1`,
    env.GITHUB_TOKEN,
    fetcher
  );
  assert.ok(
    ['ahead', 'behind', 'identical', 'diverged'].includes(comparison.status),
    'Unknown production source relation'
  );
  return comparison.status;
}

/**
 * The serving SHA, proven from the serving version's annotation or from the
 * accepted receipt of the upload that wrote it. Throws when neither proves it.
 */
export async function provenLiveSha({ deployment, readVersion, baseline }) {
  const servingId = servingVersionId(deployment);
  assert.ok(
    servingId,
    'Production traffic is split across versions; owner reconciliation required'
  );
  const annotated = annotatedSourceSha(await readVersion(servingId));
  if (annotated) return annotated;
  assert.ok(
    baseline?.versionId === servingId && fullSha.test(baseline.sha ?? ''),
    'Serving version has no source SHA and no accepted receipt names it; owner reconciliation required'
  );
  return baseline.sha;
}

/**
 * Returns the newer serving SHA when this attempt is superseded, or null when
 * it may proceed. Refuses a serving SHA off the production history.
 */
export async function supersedingSha({
  env,
  sha,
  deployment,
  readVersion,
  baseline,
  fetcher,
}) {
  const live = await provenLiveSha({ deployment, readVersion, baseline });
  if (live === sha) return null;
  const relation = await sourceRelation({
    env,
    base: sha,
    head: live,
    fetcher,
  });
  if (relation === 'ahead') return live;
  assert.equal(
    relation,
    'behind',
    'Live version is not on the production history; owner reconciliation required'
  );
  return null;
}
