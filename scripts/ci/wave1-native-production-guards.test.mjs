import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLiveRollbackUnchanged,
  readAllVersions,
} from './wave1-native-production-guards.mjs';

const SCRIPT =
  'https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/tuturuuu-calendar';
const TOKEN = 'fixture-token';
const idOf = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const V1 = '11111111-1111-1111-1111-111111111111';
const V2 = '22222222-2222-2222-2222-222222222222';
const V3 = '33333333-3333-3333-3333-333333333333';

test('F1: single non-empty page with totals still requires an explicit empty page', async () => {
  const urls = [];
  const items = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      urls.push(url);
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }] },
          result_info: {
            page: 1,
            per_page: 100,
            count: 1,
            total_count: 1,
            total_pages: 1,
          },
        };
      if (url.endsWith('/versions?per_page=100&page=2'))
        return {
          success: true,
          result: { items: [] },
          result_info: {
            page: 2,
            per_page: 100,
            count: 0,
            total_count: 1,
            total_pages: 1,
          },
        };
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  assert.deepEqual(items, [{ id: V1 }]);
  assert.deepEqual(urls, [
    `${SCRIPT}/versions?per_page=100`,
    `${SCRIPT}/versions?per_page=100&page=2`,
  ]);
});

test('H1: short numbered page with cursor:null and no totals continues to page 2', async () => {
  const urls = [];
  const items = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      urls.push(url);
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }] },
          result_info: { page: 1, cursor: null },
        };
      if (url.endsWith('/versions?per_page=100&page=2'))
        return {
          success: true,
          result: { items: [{ id: V2 }] },
          result_info: { page: 2, cursor: '' },
        };
      if (url.endsWith('/versions?per_page=100&page=3'))
        return {
          success: true,
          result: { items: [] },
          result_info: { page: 3, cursor: null },
        };
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  assert.deepEqual(
    items.map((item) => item.id),
    [V1, V2]
  );
  assert.equal(urls.length, 3);
});

test('F1/G1/K1: empty result_info.cursor does not mask result.next_cursor and empty page after cursor refuses', async () => {
  const urls = [];
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        urls.push(url);
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: [{ id: V1 }], next_cursor: 'page-2' },
            result_info: { cursor: '', per_page: 100 },
          };
        if (url.endsWith('/versions?per_page=100&cursor=page-2'))
          return {
            success: true,
            result: { items: [{ id: V2 }], next_cursor: 'page-3' },
            result_info: { cursor: '', per_page: 100 },
          };
        if (url.endsWith('/versions?per_page=100&cursor=page-3'))
          return {
            success: true,
            result: { items: [], next_cursor: '' },
            result_info: { cursor: '', per_page: 100 },
          };
        throw new Error(`Unexpected URL: ${url}`);
      },
    }),
    /empty page after advertised continuation/u
  );
  assert.deepEqual(
    urls.map((u) => u.slice(SCRIPT.length)),
    [
      '/versions?per_page=100',
      '/versions?per_page=100&cursor=page-2',
      '/versions?per_page=100&cursor=page-3',
    ]
  );
});

test('H1: cursor pagination ending on a non-empty page without empty-page proof refuses', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: [{ id: V1 }] },
            result_info: { cursor: 'c2', per_page: 100 },
          };
        return {
          success: true,
          result: { items: [{ id: V2 }] },
          result_info: { cursor: '', per_page: 100 },
        };
      },
    }),
    /cursor pagination ended on a non-empty page/u
  );
});

test('H2: contradictory totals refuse (1 item with total_pages:0; 2 items with per_page:1)', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => ({
        success: true,
        result: { items: [{ id: V1 }] },
        result_info: { page: 1, per_page: 100, total_pages: 0 },
      }),
    }),
    /non-empty page beyond total_pages/u
  );

  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => ({
        success: true,
        result: { items: [{ id: V1 }, { id: V2 }] },
        result_info: { page: 1, per_page: 1, total_pages: 1, total_count: 2 },
      }),
    }),
    /page exceeds per_page/u
  );
});

test('H2: non-empty page beyond total_pages and total_count mismatch on empty page refuse', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: [{ id: V1 }] },
            result_info: { page: 1, per_page: 100, total_pages: 1 },
          };
        return {
          success: true,
          result: { items: [{ id: V2 }] },
          result_info: { page: 2, per_page: 100 },
        };
      },
    }),
    /non-empty page beyond total_pages/u
  );

  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: [{ id: V1 }] },
            result_info: {
              page: 1,
              per_page: 100,
              count: 1,
              total_count: 2,
              total_pages: 1,
            },
          };
        return {
          success: true,
          result: { items: [] },
          result_info: {
            page: 2,
            per_page: 100,
            count: 0,
            total_count: 2,
            total_pages: 1,
          },
        };
      },
    }),
    /does not match total_count/u
  );
});

test('H3: missing item.id fails closed; absent result.items is empty only if metadata agrees', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) =>
        url.endsWith('/versions?per_page=100')
          ? { success: true, result: { items: [{ number: 1 }] } }
          : { success: true, result: { items: [] } },
    }),
    /match/u
  );

  const empty = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }] },
          result_info: { per_page: 2 },
        };
      return {
        success: true,
        result: {},
        result_info: { count: 0, total_count: 1 },
      };
    },
  });
  assert.deepEqual(empty, [{ id: V1 }]);

  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => ({
        success: true,
        result: {},
        result_info: { count: 1 },
      }),
    }),
    /page count mismatch/u
  );

  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => ({
        success: true,
        result: {},
        result_info: { total_count: 1 },
      }),
    }),
    /does not match total_count/u
  );
});

test('H3: lower positive per_page and missing echoed page succeed within maxPages', async () => {
  const items = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }, { id: V2 }] },
          result_info: { per_page: 2 },
        };
      if (url.endsWith('/versions?per_page=100&page=2'))
        return {
          success: true,
          result: { items: [{ id: V3 }] },
          result_info: { per_page: 2 },
        };
      return {
        success: true,
        result: { items: [] },
        result_info: { per_page: 2 },
      };
    },
  });
  assert.deepEqual(
    items.map((item) => item.id),
    [V1, V2, V3]
  );
});

test('J1: empty advertised last page (page === total_pages) refuses; empty page at total_pages + 1 passes', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: [{ id: V1 }] },
            result_info: { page: 1, per_page: 1, total_pages: 2 },
          };
        return {
          success: true,
          result: { items: [] },
          result_info: { page: 2, per_page: 1, total_pages: 2 },
        };
      },
    }),
    /empty page within advertised total_pages/u
  );

  const ok = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }] },
          result_info: { page: 1, per_page: 1, total_pages: 2 },
        };
      if (url.endsWith('/versions?per_page=100&page=2'))
        return {
          success: true,
          result: { items: [{ id: V2 }] },
          result_info: { page: 2, per_page: 1, total_pages: 2 },
        };
      return {
        success: true,
        result: { items: [] },
        result_info: { page: 3, per_page: 1, total_pages: 2 },
      };
    },
  });
  assert.deepEqual(
    ok.map((item) => item.id),
    [V1, V2]
  );
});

test('J2: malformed UUIDs refuse (36 hyphens, wrong group lengths, non-hex); uppercase hex passes', async () => {
  for (const badId of [
    '-'.repeat(36),
    '1111111-11111-1111-1111-111111111111',
    'gggggggg-1111-1111-1111-111111111111',
  ])
    await assert.rejects(
      readAllVersions({
        script: SCRIPT,
        token: TOKEN,
        fetchJson: async (url) =>
          url.endsWith('/versions?per_page=100')
            ? { success: true, result: { items: [{ id: badId }] } }
            : { success: true, result: { items: [] } },
      }),
      /match/u
    );

  const upper = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
  const ok = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) =>
      url.endsWith('/versions?per_page=100')
        ? { success: true, result: { items: [{ id: upper }] } }
        : { success: true, result: { items: [] } },
  });
  assert.deepEqual(ok, [{ id: upper }]);
});

test('J4: strict bound accepts 99 unique versions and refuses 100', async () => {
  const ninetyNine = Array.from({ length: 99 }, (_, i) => ({
    id: idOf(i + 1),
  }));
  const accepted = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: ninetyNine },
          result_info: { page: 1, per_page: 100, count: 99 },
        };
      return {
        success: true,
        result: { items: [] },
        result_info: { page: 2, per_page: 100, count: 0 },
      };
    },
  });
  assert.equal(accepted.length, 99);

  const hundred = Array.from({ length: 100 }, (_, i) => ({ id: idOf(i + 1) }));
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => {
        if (url.endsWith('/versions?per_page=100'))
          return {
            success: true,
            result: { items: hundred },
            result_info: { page: 1, per_page: 100, count: 100 },
          };
        return {
          success: true,
          result: { items: [] },
          result_info: { page: 2, per_page: 100, count: 0 },
        };
      },
    }),
    /exceeds bounded reconciliation/u
  );
});

for (const [label, response, pattern] of [
  [
    'non-false truthy has_more string on empty page',
    {
      success: true,
      result: { items: [], has_more: 'true' },
      result_info: { cursor: '', per_page: 100 },
    },
    /continuation without cursor/u,
  ],
  [
    'non-string cursor',
    {
      success: true,
      result: { items: [{ id: V1 }] },
      result_info: { cursor: 123, per_page: 100 },
    },
    /Malformed version inventory cursor/u,
  ],
  [
    'contradictory distinct cursors across info and result',
    {
      success: true,
      result: { items: [{ id: V1 }], next_cursor: 'b' },
      result_info: { cursor: 'a', per_page: 100 },
    },
    /Contradictory version inventory pagination metadata/u,
  ],
  [
    'contradictory cursor when page >= total_pages',
    {
      success: true,
      result: { items: [{ id: V1 }] },
      result_info: { cursor: 'next', page: 1, total_pages: 1, per_page: 100 },
    },
    /Contradictory version inventory pagination metadata/u,
  ],
])
  test(`F1: ${label} refuses`, async () => {
    await assert.rejects(
      readAllVersions({
        script: SCRIPT,
        token: TOKEN,
        fetchJson: async () => response,
      }),
      pattern
    );
  });

test('F1/G2: duplicate version id, wrong echoed page, failed later page, cursor loop, and maxPages refuse', async () => {
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => ({
        success: true,
        result: { items: [{ id: V1 }] },
      }),
    }),
    /Duplicate version id/u
  );
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) => ({
        success: true,
        result: { items: [{ id: url.endsWith('page=2') ? V2 : V1 }] },
        result_info: { page: 1, per_page: 100 },
      }),
    }),
    /page mismatch/u
  );
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async (url) =>
        url.endsWith('/versions?per_page=100')
          ? { success: true, result: { items: [{ id: V1 }] } }
          : { success: false },
    }),
    /Provider observation failed/u
  );
  let n = 0;
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      fetchJson: async () => {
        n += 1;
        return {
          success: true,
          result: { items: [{ id: idOf(n) }] },
          result_info: { cursor: 'loop-token', per_page: 100 },
        };
      },
    }),
    /cursor loop/u
  );
  let p = 0;
  await assert.rejects(
    readAllVersions({
      script: SCRIPT,
      token: TOKEN,
      maxPages: 2,
      fetchJson: async () => {
        p += 1;
        return {
          success: true,
          result: { items: [{ id: idOf(p) }] },
          result_info: { page: p, per_page: 100 },
        };
      },
    }),
    /exceeds bounded reconciliation/u
  );
});

test('F2: unchanged live deployment id and split passes; changed id or split refuses', async () => {
  const expected = {
    id: 'eb610155-8e35-4fea-89df-3ec80c1be5c6',
    versions: [{ version_id: V1, percentage: 100 }],
  };
  const live = await assertLiveRollbackUnchanged({
    script: SCRIPT,
    token: TOKEN,
    expected,
    fetchJson: async () => ({
      success: true,
      result: {
        deployments: [
          { id: expected.id, versions: [{ version_id: V1, percentage: 100 }] },
        ],
      },
    }),
  });
  assert.equal(live.id, expected.id);

  await assert.rejects(
    assertLiveRollbackUnchanged({
      script: SCRIPT,
      token: TOKEN,
      expected,
      fetchJson: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: '99999999-9999-9999-9999-999999999999',
              versions: [{ version_id: V1, percentage: 100 }],
            },
          ],
        },
      }),
    }),
    /Live deployment changed between preflight and upload/u
  );

  await assert.rejects(
    assertLiveRollbackUnchanged({
      script: SCRIPT,
      token: TOKEN,
      expected,
      fetchJson: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: expected.id,
              versions: [
                { version_id: V1, percentage: 50 },
                { version_id: V3, percentage: 50 },
              ],
            },
          ],
        },
      }),
    }),
    /version split changed between preflight and upload/u
  );
});

test('K1: empty or omitted-items page after has_more:true refuses; non-empty then empty accepts', async () => {
  for (const page2Result of [{ items: [] }, {}])
    await assert.rejects(
      readAllVersions({
        script: SCRIPT,
        token: TOKEN,
        fetchJson: async (url) =>
          url.endsWith('/versions?per_page=100')
            ? { success: true, result: { items: [{ id: V1 }], has_more: true } }
            : { success: true, result: page2Result },
      }),
      /empty page after advertised continuation/u
    );
  const ok = await readAllVersions({
    script: SCRIPT,
    token: TOKEN,
    fetchJson: async (url) => {
      if (url.endsWith('/versions?per_page=100'))
        return {
          success: true,
          result: { items: [{ id: V1 }], has_more: true },
        };
      if (url.endsWith('/versions?per_page=100&page=2'))
        return {
          success: true,
          result: { items: [{ id: V2 }], has_more: false },
        };
      return { success: true, result: { items: [] } };
    },
  });
  assert.deepEqual(
    ok.map((i) => i.id),
    [V1, V2]
  );
});
