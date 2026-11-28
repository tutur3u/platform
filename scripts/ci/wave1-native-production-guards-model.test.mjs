import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertActiveVersionsPresent,
  readAllVersions,
} from './wave1-native-production-guards.mjs';
import { assertResolvedVersionsAbsent } from './wave1-native-production-resolution.mjs';

const SCRIPT =
  'https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/tuturuuu-calendar';
const TOKEN = 'fixture-token';
const OCT_SHA = 'ac8beee09e9700b453a55e193db5957985e01956';
const idOf = (n) =>
  `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`;

const parseQuery = (url) => {
  const query = new URL(url).searchParams;
  return {
    page: Number(query.get('page') ?? 1),
    cursor: query.get('cursor'),
    perPage: Number(query.get('per_page') ?? 100),
  };
};

const slicePage = (ids, page, pageSize) =>
  ids.slice((page - 1) * pageSize, page * pageSize).map((id) => ({ id }));

/**
 * Deterministic simulated Workers-versions server behaviour matrix.
 *
 * Documented Cloudflare `V4PagePagination` numbered-page servers (`honest: true`)
 * MUST be accepted for every N in 0..12 (availability).
 *
 * Non-numbered or dishonest servers (`honest: false`) MUST either be refused
 * (`readAllVersions` or `assertActiveVersionsPresent` throws) or, only when the
 * fault does not truncate the N-item inventory, return the exact full N-item set.
 *
 * Matrix summary (N in 0..12):
 *   honest-full-metadata            -> ACCEPTED (all N)
 *   honest-small-per-page           -> ACCEPTED (all N, pageSize=3 < requested 100)
 *   honest-no-total-count           -> ACCEPTED (all N)
 *   honest-no-total-pages           -> ACCEPTED (all N)
 *   honest-no-result-info           -> ACCEPTED (all N)
 *   honest-omitted-items-terminal   -> ACCEPTED (all N)
 *   honest-has-more-flags           -> ACCEPTED (all N)
 *   cursor-mode-empty-terminal      -> REFUSED (N>=1; K1 empty page after cursor)
 *   cursor-mode-nonempty-terminal   -> REFUSED (N>=1; H1 non-empty cursor end)
 *   ignored-page-param              -> REFUSED (N>=1; duplicate id on page 2)
 *   has-more-then-empty-array       -> REFUSED (N>=1; K1 empty array after has_more)
 *   has-more-then-omitted-items     -> REFUSED (N>=1; K1 omitted items after has_more)
 *   drop-last-page-with-total-pages -> REFUSED (N>=1; J1 empty page <= total_pages)
 *   drop-last-page-with-total-count -> REFUSED (N>=1; seenIds.size !== total_count)
 *   drop-last-page-with-has-more    -> REFUSED (N>=4; K1 empty after has_more)
 *   early-empty-page-before-more    -> REFUSED (N>=1; empty page within totals)
 *   late-nonempty-after-total-pages -> REFUSED (N>=4; non-empty page > total_pages)
 *   truncated-total-count-metadata  -> REFUSED (N>=1; seenIds.size > total_count)
 *   page-error-mid-walk               -> REFUSED (N>=1; success:false on page 2)
 *   empty-first-page-active-present   -> REFUSED (N>=1; K2 active id missing)
 *   omitted-active-version            -> REFUSED (N>=1; K2 active id missing)
 *   omitted-historical-deployed       -> REFUSED (N>=2; R6-3 full deployments history)
 *   metadata-free-early-empty-residual-> ACCEPTED-BY-DESIGN (R6-1 documented residual:
 *                                        page 1 [active] no result_info, page 2 [] no
 *                                        metadata while undeployed versions exist;
 *                                        indistinguishable from a 1-version server;
 *                                        compensated by one-time release-day manual audit)
 */
const BEHAVIOURS = [
  {
    name: 'honest-full-metadata',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 100);
      const totalPages = ids.length ? 1 : 0;
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 100,
          count: items.length,
          total_count: ids.length,
          total_pages: totalPages,
        },
      };
    },
  },
  {
    name: 'honest-small-per-page',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_count: ids.length,
          total_pages: Math.ceil(ids.length / 3),
        },
      };
    },
  },
  {
    name: 'honest-no-total-count',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_pages: Math.ceil(ids.length / 3),
        },
      };
    },
  },
  {
    name: 'honest-no-total-pages',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_count: ids.length,
        },
      };
    },
  },
  {
    name: 'honest-no-result-info',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      return { success: true, result: { items: slicePage(ids, page, 3) } };
    },
  },
  {
    name: 'honest-omitted-items-terminal',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: items.length > 0 ? { items } : {},
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_count: ids.length,
          total_pages: Math.ceil(ids.length / 3),
        },
      };
    },
  },
  {
    name: 'honest-has-more-flags',
    honest: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      const hasMore = page * 3 < ids.length;
      return {
        success: true,
        result: { items, has_more: hasMore },
        result_info: { page, per_page: 3, count: items.length },
      };
    },
  },
  {
    name: 'cursor-mode-empty-terminal',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { cursor } = parseQuery(url);
      const page = cursor ? Number(cursor.slice(1)) : 1;
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          cursor: items.length > 0 ? `p${page + 1}` : '',
          per_page: 3,
        },
      };
    },
  },
  {
    name: 'cursor-mode-nonempty-terminal',
    honest: false,
    mustRefuse: (n) => n >= 4,
    serve: (ids, url) => {
      const { cursor } = parseQuery(url);
      const page = cursor ? Number(cursor.slice(1)) : 1;
      const items = slicePage(ids, page, 3);
      const hasNext = page * 3 < ids.length;
      return {
        success: true,
        result: { items },
        result_info: {
          cursor: hasNext ? `p${page + 1}` : '',
          per_page: 3,
        },
      };
    },
  },
  {
    name: 'ignored-page-param',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids) => ({
      success: true,
      result: { items: slicePage(ids, 1, 3) },
    }),
  },
  {
    name: 'has-more-then-empty-array',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      if (page === 1)
        return {
          success: true,
          result: { items: slicePage(ids, 1, 3), has_more: ids.length > 0 },
        };
      return { success: true, result: { items: [] } };
    },
  },
  {
    name: 'has-more-then-omitted-items',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      if (page === 1)
        return {
          success: true,
          result: { items: slicePage(ids, 1, 3), has_more: ids.length > 0 },
        };
      return { success: true, result: {} };
    },
  },
  {
    name: 'drop-last-page-with-total-pages',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const totalPages = Math.ceil(ids.length / 3);
      const items = page >= totalPages ? [] : slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_pages: totalPages,
        },
      };
    },
  },
  {
    name: 'drop-last-page-with-total-count',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const totalPages = Math.ceil(ids.length / 3);
      const items = page >= totalPages ? [] : slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_count: ids.length,
        },
      };
    },
  },
  {
    name: 'drop-last-page-with-has-more',
    honest: false,
    mustRefuse: (n) => n >= 4,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const totalPages = Math.ceil(ids.length / 3);
      if (totalPages <= 1)
        return { success: true, result: { items: slicePage(ids, page, 3) } };
      if (page < totalPages)
        return {
          success: true,
          result: { items: slicePage(ids, page, 3), has_more: true },
        };
      return { success: true, result: {} };
    },
  },
  {
    name: 'early-empty-page-before-more',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      return {
        success: true,
        result: { items: [] },
        result_info: {
          page,
          per_page: 3,
          count: 0,
          total_count: ids.length,
          total_pages: Math.ceil(ids.length / 3),
        },
      };
    },
  },
  {
    name: 'late-nonempty-after-total-pages',
    honest: false,
    mustRefuse: (n) => n >= 4,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      const totalPages = Math.ceil(ids.length / 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_pages: totalPages > 1 ? totalPages - 1 : totalPages,
        },
      };
    },
  },
  {
    name: 'truncated-total-count-metadata',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const items = slicePage(ids, page, 3);
      return {
        success: true,
        result: { items },
        result_info: {
          page,
          per_page: 3,
          count: items.length,
          total_count: Math.max(0, ids.length - 1),
        },
      };
    },
  },
  {
    name: 'page-error-mid-walk',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      if (page === 1)
        return { success: true, result: { items: slicePage(ids, 1, 3) } };
      return { success: false, errors: [{ message: 'transient error' }] };
    },
  },
  {
    name: 'empty-first-page-active-present',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: () => ({ success: true, result: {} }),
  },
  {
    name: 'omitted-active-version',
    honest: false,
    mustRefuse: (n) => n >= 1,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const withoutActive = ids.slice(1);
      return {
        success: true,
        result: { items: slicePage(withoutActive, page, 3) },
      };
    },
  },
  {
    name: 'omitted-historical-deployed',
    honest: false,
    mustRefuse: (n) => n >= 2,
    deploymentsFor: (ids) =>
      ids.length >= 2
        ? [
            { id: 'd0', versions: [{ version_id: ids[0], percentage: 100 }] },
            {
              id: 'd1',
              versions: [{ version_id: ids.at(-1), percentage: 100 }],
            },
          ]
        : ids.length === 1
          ? [{ id: 'd0', versions: [{ version_id: ids[0], percentage: 100 }] }]
          : [],
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      const withoutLast = ids.length >= 2 ? ids.slice(0, -1) : ids;
      return {
        success: true,
        result: { items: slicePage(withoutLast, page, 3) },
      };
    },
  },
  {
    name: 'metadata-free-early-empty-residual',
    honest: false,
    residual: true,
    mustRefuse: () => false,
    serve: (ids, url) => {
      const { page } = parseQuery(url);
      if (page === 1)
        return {
          success: true,
          result: { items: ids.length ? [{ id: ids[0] }] : [] },
        };
      return { success: true, result: { items: [] } };
    },
  },
];

test('model-based: every server behaviour either refuses or returns exact full N-version set and catches October SHA at every position', async () => {
  for (const behaviour of BEHAVIOURS) {
    for (let n = 0; n <= 12; n += 1) {
      const ids = Array.from({ length: n }, (_, index) => idOf(index));
      const deployments = behaviour.deploymentsFor
        ? behaviour.deploymentsFor(ids)
        : ids.length
          ? [{ id: 'd0', versions: [{ version_id: ids[0], percentage: 100 }] }]
          : [];
      let versionItems = null;
      let error = null;
      try {
        versionItems = await readAllVersions({
          script: SCRIPT,
          token: TOKEN,
          fetchJson: async (url) => behaviour.serve(ids, url),
        });
        if (deployments.length > 0)
          assertActiveVersionsPresent({ deployments, versionItems });
      } catch (caught) {
        error = caught;
      }

      if (behaviour.honest) {
        assert.equal(
          error,
          null,
          `Honest server ${behaviour.name} (N=${n}) must be accepted, got: ${error?.message}`
        );
      }
      if (behaviour.mustRefuse(n)) {
        assert.notEqual(
          error,
          null,
          `Dishonest server ${behaviour.name} (N=${n}) must be refused`
        );
      }

      if (behaviour.residual) {
        // R6-1 documented residual: metadata-free page 1 [active] + page 2 []
        // is indistinguishable from a 1-version server; accepted by design and
        // compensated by the one-time release-day manual audit.
        assert.equal(error, null);
        assert.deepEqual(
          versionItems.map((item) => item.id),
          ids.length ? [ids[0]] : []
        );
        continue;
      }

      if (error === null) {
        const returnedIds = versionItems.map((item) => item.id).sort();
        assert.deepEqual(
          returnedIds,
          [...ids].sort(),
          `Server ${behaviour.name} (N=${n}) returned incomplete/mismatched inventory`
        );
        for (let octPos = 0; octPos < n; octPos += 1) {
          const observedVersions = versionItems.map((item) => ({
            id: item.id,
            annotations: {
              'workers/message':
                item.id === ids[octPos] ? OCT_SHA : 'e'.repeat(40),
            },
          }));
          assert.throws(
            () =>
              assertResolvedVersionsAbsent({
                app: 'calendar',
                versions: observedVersions,
              }),
            /owner reconciliation required/u,
            `Server ${behaviour.name} (N=${n}, octPos=${octPos}) missed October version`
          );
        }
      }
    }
  }
});

test('K2: assertActiveVersionsPresent requires active and rollback version ids in inventory', () => {
  const v1 = idOf(0);
  const v2 = idOf(1);
  const deployments = [
    { id: 'd1', versions: [{ version_id: v1, percentage: 100 }] },
  ];
  const rollback = {
    id: 'd0',
    versions: [{ version_id: v2, percentage: 100 }],
  };
  assert.doesNotThrow(() =>
    assertActiveVersionsPresent({
      deployments,
      rollback,
      versionItems: [{ id: v1 }, { id: v2 }],
    })
  );
  assert.throws(
    () => assertActiveVersionsPresent({ deployments, versionItems: [] }),
    /active deployment version .* missing/u
  );
  assert.throws(
    () =>
      assertActiveVersionsPresent({
        deployments,
        rollback,
        versionItems: [{ id: v1 }],
      }),
    /rollback deployment version .* missing/u
  );
});

test('R6-2: UUID case canonicalization catches uppercase duplicates and matches mixed-case deployments in both directions', async () => {
  const lower = '808c2f3b-9979-4ccc-92a3-879043f25163';
  const upper = lower.toUpperCase();
  // Uppercase twin cannot satisfy total_count: 2 as a distinct version.
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) =>
        url.endsWith('/versions?per_page=100')
          ? {
              success: true,
              result: { items: [{ id: lower }, { id: upper }] },
              result_info: {
                page: 1,
                per_page: 100,
                count: 2,
                total_count: 2,
                total_pages: 1,
              },
            }
          : { success: true, result: { items: [] } },
    }),
    /Duplicate version id/u
  );
  // Uppercase list UUID matches lowercase deployment UUID.
  assert.doesNotThrow(() =>
    assertActiveVersionsPresent({
      deployments: [
        { id: 'd1', versions: [{ version_id: lower, percentage: 100 }] },
      ],
      versionItems: [{ id: upper }],
    })
  );
  // Lowercase list UUID matches uppercase deployment UUID.
  assert.doesNotThrow(() =>
    assertActiveVersionsPresent({
      deployments: [
        { id: 'd1', versions: [{ version_id: upper, percentage: 100 }] },
      ],
      versionItems: [{ id: lower }],
    })
  );
});

test('R6-3: assertActiveVersionsPresent requires every version id in full deployments history, gradual splits, and trimmed history', () => {
  const v1 = idOf(0);
  const v2 = idOf(1);
  const v3 = idOf(2);
  const fullHistory = [
    { id: 'd2', versions: [{ version_id: v1, percentage: 100 }] },
    {
      id: 'd1',
      versions: [
        { version_id: v1, percentage: 50 },
        { version_id: v2, percentage: 50 },
      ],
    },
    { id: 'd0', versions: [{ version_id: v3, percentage: 100 }] },
  ];
  assert.doesNotThrow(() =>
    assertActiveVersionsPresent({
      deployments: fullHistory,
      versionItems: [{ id: v1 }, { id: v2 }, { id: v3 }],
    })
  );
  // Missing version from an older gradual split or earlier deployment refuses.
  assert.throws(
    () =>
      assertActiveVersionsPresent({
        deployments: fullHistory,
        versionItems: [{ id: v1 }, { id: v2 }],
      }),
    /deployed version .* missing/u
  );
  assert.throws(
    () =>
      assertActiveVersionsPresent({
        deployments: fullHistory,
        versionItems: [{ id: v1 }, { id: v3 }],
      }),
    /deployed version .* missing/u
  );
  // Trimmed single-deployment history checks only the returned deployment.
  assert.doesNotThrow(() =>
    assertActiveVersionsPresent({
      deployments: [fullHistory[0]],
      versionItems: [{ id: v1 }],
    })
  );
});
