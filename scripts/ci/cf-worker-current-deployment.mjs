import assert from 'node:assert/strict';

/** Cloudflare lists the deployment currently serving traffic first. */
export async function currentDeployment(request, path) {
  const body = await request(path);
  const fail = (condition) =>
    assert.ok(
      condition,
      `active deployment rollback target unavailable for GET ${path}`
    );
  fail(body.result_info?.page === undefined || body.result_info.page === 1);
  const history = body.result?.deployments;
  fail(Array.isArray(history) && history.length > 0 && history.length <= 50);
  const active = history[0];
  fail(typeof active?.id === 'string' && active.id.length > 0);
  fail(
    Array.isArray(active.versions) &&
      active.versions.length > 0 &&
      active.versions.length <= 100
  );
  const versions = active.versions.map((version) => {
    fail(
      typeof version?.version_id === 'string' && version.version_id.length > 0
    );
    fail(
      Number.isFinite(version.percentage) &&
        version.percentage > 0 &&
        version.percentage <= 100
    );
    return { version_id: version.version_id, percentage: version.percentage };
  });
  fail(
    new Set(versions.map((version) => version.version_id)).size ===
      versions.length
  );
  fail(
    Math.abs(
      versions.reduce((sum, version) => sum + version.percentage, 0) - 100
    ) < 1e-8
  );
  // History is deliberately incomplete; rollback needs the current traffic split.
  return { deployments: [{ id: active.id, versions }] };
}
