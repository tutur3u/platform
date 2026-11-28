// Fail-closed preflight and pre-upload guards for the wave-1 production
// publisher: complete hosted-version inventory traversal and live-rollback
// re-verification immediately before upload.
import assert from 'node:assert/strict';
import { sameSplit } from './wave1-production-deployments.mjs';

const VERSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeVersionId = (id) => id.toLowerCase();

const isMoreFlag = (value) =>
  value !== undefined && value !== null && value !== false;

/**
 * Read the hosted version inventory for a Worker using bounded, fail-closed
 * pagination.
 *
 * An explicit empty page is the provider's documented terminal signal; the
 * guard cannot prove more (a metadata-free silent truncation of an undeployed
 * version is a residual covered by the compensating release-day manual audit).
 * Pagination metadata (`total_count`, `total_pages`, `per_page`, `count`,
 * `page`, `has_more`, cursors) is used solely to advance or refuse on
 * contradiction, never to terminate early on a non-empty page. For positive
 * `total_pages`, the empty terminating page must be strictly beyond
 * `total_pages` (`page > total_pages`). Once `has_more: true`, a non-empty
 * cursor, `page < total_pages`, or `seenIds.size < total_count` is advertised,
 * the next page must be non-empty; an empty or absent-`items` page after an
 * advertised continuation refuses.
 *
 * Absent `result.items` (optional in Cloudflare's OpenAPI schema and defaulted
 * to `[]` by `cloudflare-typescript` `V4PagePagination`) is treated as an
 * empty page only when `success === true`, `result` is an object, and metadata
 * does not claim `count > 0`, `total_count > seenIds.size`, `has_more`, or a
 * continuation cursor. Any version row missing a valid 8-4-4-4-12 UUID `id`
 * fails closed (UUIDs are canonicalized to lowercase for duplicate detection,
 * `total_count` counting, and deployment membership), and inventories with 100
 * or more unique versions fail closed.
 */
export async function readAllVersions({
  script,
  token,
  fetchJson,
  maxPages = 10,
  maxVersions = 100,
}) {
  const seenCursors = new Set();
  const seenIds = new Set();
  const items = [];
  let cursor = null;
  let paginationMode = null;
  let expectedTotal = null;
  let expectedTotalPages = null;
  let continuationAdvertised = false;

  for (let page = 1; ; page += 1) {
    assert.ok(
      page <= maxPages,
      'Version history exceeds bounded reconciliation'
    );
    const url =
      page === 1
        ? `${script}/versions?per_page=100`
        : cursor !== null
          ? `${script}/versions?per_page=100&cursor=${encodeURIComponent(cursor)}`
          : `${script}/versions?per_page=100&page=${page}`;
    const response = await fetchJson(url, token);
    assert.equal(response?.success, true, 'Provider observation failed');
    assert.ok(
      response.result &&
        typeof response.result === 'object' &&
        !Array.isArray(response.result),
      'Malformed version inventory'
    );
    const rawItems = response.result.items;
    assert.ok(
      rawItems === undefined || Array.isArray(rawItems),
      'Malformed version inventory'
    );
    const pageItems = rawItems ?? [];

    for (const item of pageItems) {
      assert.ok(
        item && typeof item === 'object' && !Array.isArray(item),
        'Malformed version inventory item'
      );
      assert.match(item.id ?? '', VERSION_ID_RE);
      const canonicalId = normalizeVersionId(item.id);
      assert.ok(
        !seenIds.has(canonicalId),
        'Duplicate version id in version inventory'
      );
      seenIds.add(canonicalId);
      items.push(item);
    }
    assert.ok(
      items.length < maxVersions,
      'Version history exceeds bounded reconciliation'
    );

    const rawInfo = response.result_info;
    assert.ok(
      rawInfo === undefined ||
        rawInfo === null ||
        (typeof rawInfo === 'object' && !Array.isArray(rawInfo)),
      'Malformed version inventory pagination metadata'
    );
    const info = rawInfo ?? {};
    if (info.count !== undefined)
      assert.equal(
        info.count,
        pageItems.length,
        'Version inventory page count mismatch'
      );
    if (info.per_page !== undefined) {
      assert.ok(
        Number.isSafeInteger(info.per_page) && info.per_page > 0,
        'Malformed version inventory per_page'
      );
      assert.ok(
        pageItems.length <= info.per_page,
        'Version inventory page exceeds per_page'
      );
    }
    if (info.page !== undefined)
      assert.equal(info.page, page, 'Version inventory page mismatch');
    if (info.total_pages !== undefined) {
      assert.ok(
        Number.isSafeInteger(info.total_pages) && info.total_pages >= 0,
        'Malformed version inventory total_pages'
      );
      if (expectedTotalPages === null) expectedTotalPages = info.total_pages;
      else
        assert.equal(
          info.total_pages,
          expectedTotalPages,
          'Version inventory changed during pagination'
        );
    }
    if (info.total_count !== undefined) {
      assert.ok(
        Number.isSafeInteger(info.total_count) && info.total_count >= 0,
        'Malformed version inventory total_count'
      );
      if (expectedTotal === null) expectedTotal = info.total_count;
      else
        assert.equal(
          info.total_count,
          expectedTotal,
          'Version inventory changed during pagination'
        );
    }

    if (expectedTotalPages !== null && pageItems.length > 0)
      assert.ok(
        page <= expectedTotalPages,
        'Contradictory version inventory: non-empty page beyond total_pages'
      );
    if (expectedTotal !== null)
      assert.ok(
        seenIds.size <= expectedTotal,
        'Incomplete version inventory: observed version count exceeds total_count'
      );

    const cursorsObj = info.cursors;
    assert.ok(
      cursorsObj === undefined ||
        cursorsObj === null ||
        (typeof cursorsObj === 'object' && !Array.isArray(cursorsObj)),
      'Malformed version inventory cursors'
    );
    const nonEmptyCursors = new Set();
    for (const candidate of [
      info.cursor,
      cursorsObj?.after,
      response.result.cursor,
      response.result.next_cursor,
    ]) {
      if (candidate === undefined || candidate === null) continue;
      assert.equal(
        typeof candidate,
        'string',
        'Malformed version inventory cursor'
      );
      if (candidate.length > 0) nonEmptyCursors.add(candidate);
    }
    assert.ok(
      nonEmptyCursors.size <= 1,
      'Contradictory version inventory pagination metadata'
    );
    const nextCursor =
      nonEmptyCursors.size === 1 ? [...nonEmptyCursors][0] : null;
    const hasMore =
      isMoreFlag(info.has_more) || isMoreFlag(response.result.has_more);

    // Completeness is proven ONLY by an explicit empty page.
    if (pageItems.length === 0) {
      assert.ok(
        nextCursor === null,
        'Contradictory version inventory pagination metadata'
      );
      assert.ok(
        !hasMore,
        'Incomplete version inventory: continuation without cursor or next page'
      );
      if (expectedTotal !== null)
        assert.equal(
          seenIds.size,
          expectedTotal,
          'Incomplete version inventory: observed version count does not match total_count'
        );
      if (expectedTotalPages !== null && expectedTotalPages > 0)
        assert.ok(
          page > expectedTotalPages,
          'Incomplete version inventory: empty page within advertised total_pages'
        );
      assert.ok(
        !continuationAdvertised,
        'Incomplete version inventory: empty page after advertised continuation'
      );
      return items;
    }

    // Non-empty page: cursor mode is entered only on a non-empty cursor.
    if (nextCursor !== null) {
      assert.ok(
        paginationMode !== 'page' &&
          (expectedTotalPages === null || page < expectedTotalPages) &&
          (expectedTotal === null || seenIds.size < expectedTotal),
        'Contradictory version inventory pagination metadata'
      );
      assert.ok(!seenCursors.has(nextCursor), 'Version inventory cursor loop');
      paginationMode = 'cursor';
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      continuationAdvertised = true;
      continue;
    }

    assert.ok(
      paginationMode !== 'cursor',
      'Incomplete version inventory: cursor pagination ended on a non-empty page'
    );
    paginationMode = 'page';
    cursor = null;
    continuationAdvertised =
      hasMore ||
      (expectedTotalPages !== null && page < expectedTotalPages) ||
      (expectedTotal !== null && seenIds.size < expectedTotal);
  }
}

/**
 * Verify that the observed version inventory contains every version id
 * referenced by ANY deployment returned in the preflight `GET /deployments`
 * history (active deployment, gradual splits, and every returned historical
 * deployment) plus any optional rollback snapshot. UUIDs are canonicalized to
 * lowercase so case differences between `/versions` and `/deployments` neither
 * hide duplicates nor cause false membership refusals.
 */
export function assertActiveVersionsPresent({
  deployments,
  rollback = null,
  versionItems,
}) {
  assert.ok(
    Array.isArray(deployments) && deployments.length > 0,
    'Active deployment missing during version inventory check'
  );
  const active = deployments[0];
  assert.ok(
    active && Array.isArray(active.versions) && active.versions.length > 0,
    'Active deployment versions missing during version inventory check'
  );
  const requiredIds = new Map();
  for (let index = 0; index < deployments.length; index += 1) {
    const deployment = deployments[index];
    assert.ok(
      deployment &&
        typeof deployment === 'object' &&
        Array.isArray(deployment.versions),
      'Deployment versions missing during version inventory check'
    );
    const kind = index === 0 ? 'active deployment' : 'deployed';
    for (const entry of deployment.versions) {
      assert.match(
        entry?.version_id ?? '',
        VERSION_ID_RE,
        index === 0
          ? 'Malformed active deployment version id'
          : 'Malformed deployment history version id'
      );
      const canonical = normalizeVersionId(entry.version_id);
      if (!requiredIds.has(canonical)) requiredIds.set(canonical, kind);
    }
  }
  if (rollback !== null && rollback !== undefined) {
    assert.ok(
      Array.isArray(rollback.versions) && rollback.versions.length > 0,
      'Rollback deployment versions missing during version inventory check'
    );
    for (const entry of rollback.versions) {
      assert.match(
        entry?.version_id ?? '',
        VERSION_ID_RE,
        'Malformed rollback deployment version id'
      );
      const canonical = normalizeVersionId(entry.version_id);
      if (!requiredIds.has(canonical))
        requiredIds.set(canonical, 'active deployment');
    }
  }
  const observedIds = new Set(
    (Array.isArray(versionItems) ? versionItems : [])
      .filter(
        (item) => typeof item?.id === 'string' && VERSION_ID_RE.test(item.id)
      )
      .map((item) => normalizeVersionId(item.id))
  );
  for (const [id, kind] of requiredIds)
    assert.ok(
      observedIds.has(id),
      `Incomplete version inventory: ${kind} version ${id} missing from version list`
    );
}

/**
 * Re-read the Worker's active deployment immediately before upload and refuse
 * if either its deployment id or its version split differs from the preflight
 * rollback snapshot. Closes the preflight-to-upload drift window up to the
 * single Cloudflare API round-trip (Cloudflare has no CAS on version upload).
 */
export async function assertLiveRollbackUnchanged({
  script,
  token,
  fetchJson,
  expected,
}) {
  const response = await fetchJson(`${script}/deployments`, token);
  assert.equal(response?.success, true, 'Live deployment check failed');
  const live = response.result?.deployments?.[0];
  assert.ok(
    live && typeof live.id === 'string' && live.id.length > 0,
    'Live deployment missing before upload'
  );
  assert.equal(
    live.id,
    expected?.id,
    'Live deployment changed between preflight and upload; start a fresh read-only preflight'
  );
  assert.ok(
    sameSplit(live.versions, expected?.versions),
    'Live deployment version split changed between preflight and upload; start a fresh read-only preflight'
  );
  return live;
}
