import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { oldId, setup, sha } from './wave1-native-production-test-helper.mjs';

const OCT_SHA_1 = 'ac8beee09e9700b453a55e193db5957985e01956';
const OCT_DIGEST_2 =
  '6dec01d9d95a94cfe543afddc402ea15cb4b1018d03fd335aaca08463b2ba51b';
const PAGE2_ID = '33333333-3333-3333-3333-333333333333';

test('F1/K1: short first page + cursor continuation followed by empty page refuses with zero writes', async (t) => {
  const p = setup(t);
  const seen = [];
  p.state.versionAnnotationsById = {
    [oldId]: { 'workers/message': 'e'.repeat(40) },
    [PAGE2_ID]: { 'workers/message': OCT_SHA_1 },
  };
  p.state.versionsResponse = (url) => {
    seen.push(url);
    if (url.endsWith('/versions?per_page=100'))
      return Response.json({
        success: true,
        result: { items: [{ id: oldId }] },
        result_info: { cursor: 'page-2-cursor', per_page: 100 },
      });
    if (url.endsWith('/versions?per_page=100&cursor=page-2-cursor'))
      return Response.json({
        success: true,
        result: { items: [{ id: PAGE2_ID }] },
        result_info: { cursor: 'page-3-empty', per_page: 100 },
      });
    if (url.endsWith('/versions?per_page=100&cursor=page-3-empty'))
      return Response.json({
        success: true,
        result: { items: [] },
        result_info: { cursor: '', per_page: 100 },
      });
    throw new Error(`Unexpected versions URL: ${url}`);
  };
  await assert.rejects(p.run(), /empty page after advertised continuation/u);
  assert.ok(seen.some((u) => u.endsWith('cursor=page-2-cursor')));
  assert.equal(p.state.writes, 0);
});

test('F1/H1/H4: short numbered page with cursor:null and October SHA on page 2 refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionAnnotationsById = {
    [oldId]: { 'workers/message': 'e'.repeat(40) },
    [PAGE2_ID]: { 'workers/message': OCT_SHA_1 },
  };
  p.state.versionsResponse = (url) => {
    if (url.endsWith('/versions?per_page=100'))
      return Response.json({
        success: true,
        result: { items: [{ id: oldId }] },
        result_info: { page: 1, cursor: null },
      });
    if (url.endsWith('/versions?per_page=100&page=2'))
      return Response.json({
        success: true,
        result: { items: [{ id: PAGE2_ID }] },
        result_info: { page: 2, cursor: '' },
      });
    if (url.endsWith('/versions?per_page=100&page=3'))
      return Response.json({
        success: true,
        result: { items: [] },
        result_info: { page: 3, cursor: null },
      });
    throw new Error(`Unexpected versions URL: ${url}`);
  };
  await assert.rejects(p.run(), /owner reconciliation required/u);
  assert.equal(p.state.writes, 0);
});

test('F1/G1/K1: empty result_info.cursor does not mask result.next_cursor and refuses with zero writes', async (t) => {
  const p = setup(t);
  const seen = [];
  p.state.versionAnnotationsById = {
    [oldId]: { 'workers/message': 'e'.repeat(40) },
    [PAGE2_ID]: { 'workers/message': OCT_SHA_1 },
  };
  p.state.versionsResponse = (url) => {
    seen.push(url);
    if (url.endsWith('/versions?per_page=100'))
      return Response.json({
        success: true,
        result: { items: [{ id: oldId }], next_cursor: 'p2' },
        result_info: { cursor: '', per_page: 100 },
      });
    if (url.endsWith('/versions?per_page=100&cursor=p2'))
      return Response.json({
        success: true,
        result: { items: [{ id: PAGE2_ID }], next_cursor: 'p3' },
        result_info: { cursor: '', per_page: 100 },
      });
    if (url.endsWith('/versions?per_page=100&cursor=p3'))
      return Response.json({
        success: true,
        result: { items: [], next_cursor: '' },
        result_info: { cursor: '', per_page: 100 },
      });
    throw new Error(`Unexpected versions URL: ${url}`);
  };
  await assert.rejects(p.run(), /empty page after advertised continuation/u);
  assert.ok(seen.some((u) => u.endsWith('cursor=p2')));
  assert.equal(p.state.writes, 0);
});

test('F1: short first page + total_pages continuation with October digest on page 2 refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionAnnotationsById = {
    [oldId]: { 'workers/message': 'e'.repeat(40) },
    [PAGE2_ID]: { 'workers/tag': OCT_DIGEST_2 },
  };
  p.state.versionsResponse = (url) => {
    if (url.endsWith('/versions?per_page=100'))
      return Response.json({
        success: true,
        result: { items: [{ id: oldId }] },
        result_info: {
          page: 1,
          per_page: 100,
          count: 1,
          total_count: 2,
          total_pages: 2,
        },
      });
    if (url.endsWith('/versions?per_page=100&page=2'))
      return Response.json({
        success: true,
        result: { items: [{ id: PAGE2_ID }] },
        result_info: {
          page: 2,
          per_page: 100,
          count: 1,
          total_count: 2,
          total_pages: 2,
        },
      });
    if (url.endsWith('/versions?per_page=100&page=3'))
      return Response.json({
        success: true,
        result: { items: [] },
        result_info: {
          page: 3,
          per_page: 100,
          count: 0,
          total_count: 2,
          total_pages: 2,
        },
      });
    throw new Error(`Unexpected versions URL: ${url}`);
  };
  await assert.rejects(p.run(), /owner reconciliation required/u);
  assert.equal(p.state.writes, 0);
});

test('F1/G2: ignored page param (repeated version id without totals) refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionsResponse = () =>
    Response.json({
      success: true,
      result: { items: [{ id: oldId }] },
    });
  await assert.rejects(p.run(), /Duplicate version id/u);
  assert.equal(p.state.writes, 0);
});

test('F1/H4: valid numbered response with empty cursor fields and no totals passes on empty page 2', async (t) => {
  const p = setup(t);
  p.state.versionsResponse = (url) => {
    if (url.endsWith('/versions?per_page=100'))
      return Response.json({
        success: true,
        result: { items: [{ id: oldId }] },
        result_info: { page: 1, per_page: 100, count: 1, cursor: null },
      });
    if (url.endsWith('/versions?per_page=100&page=2'))
      return Response.json({
        success: true,
        result: { items: [] },
        result_info: { page: 2, per_page: 100, count: 0, cursor: '' },
      });
    throw new Error(`Unexpected versions URL: ${url}`);
  };
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
});

test('F1: complete single page with totals still passes (after empty page 2)', async (t) => {
  const p = setup(t);
  p.state.ids = [oldId];
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
});

test('F2: new deployment id appearing between preflight and upload refuses with zero writes', async (t) => {
  const p = setup(t);
  const readEnv = { ...p.env };
  delete readEnv.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  const preflight = await p.run({
    argv: ['calendar', sha, 'preflight'],
    env: readEnv,
  });
  assert.equal(preflight.state, 'preflight');
  assert.equal(p.state.writes, 0);

  // Another writer lands a new deployment before the upload step runs.
  p.state.deploymentId = 'concurrent-deployment-id';
  const uploadEnv = { ...p.env };
  delete uploadEnv.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN;
  delete uploadEnv.GITHUB_TOKEN;
  await assert.rejects(
    p.run({ argv: ['calendar', sha, 'upload'], env: uploadEnv }),
    /Live deployment changed between preflight and upload/u
  );
  assert.equal(p.state.writes, 0);
  const receipt = JSON.parse(
    readFileSync(
      join(p.env.RUNNER_TEMP, 'calendar-production-publication.json'),
      'utf8'
    )
  );
  assert.equal(receipt.state, 'preflight');
});

test('F2: changed live version split between preflight and upload refuses with zero writes', async (t) => {
  const p = setup(t);
  const readEnv = { ...p.env };
  delete readEnv.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  await p.run({ argv: ['calendar', sha, 'preflight'], env: readEnv });

  // Same deployment id, different active version split before upload.
  p.state.active = PAGE2_ID;
  const uploadEnv = { ...p.env };
  delete uploadEnv.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN;
  delete uploadEnv.GITHUB_TOKEN;
  await assert.rejects(
    p.run({ argv: ['calendar', sha, 'upload'], env: uploadEnv }),
    /version split changed between preflight and upload/u
  );
  assert.equal(p.state.writes, 0);
  const receipt = JSON.parse(
    readFileSync(
      join(p.env.RUNNER_TEMP, 'calendar-production-publication.json'),
      'utf8'
    )
  );
  assert.equal(receipt.state, 'preflight');
});

test('K2: empty first page (result:{}) contradicting active deployment refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionsResponse = () => Response.json({ success: true, result: {} });
  await assert.rejects(
    p.run(),
    /Incomplete version inventory: active deployment version .* missing/u
  );
  assert.equal(p.state.writes, 0);
});

test('K2: version inventory omitting active deployment version refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionAnnotationsById = {
    [PAGE2_ID]: { 'workers/message': 'e'.repeat(40) },
  };
  p.state.versionsResponse = (url) =>
    url.endsWith('/versions?per_page=100')
      ? Response.json({ success: true, result: { items: [{ id: PAGE2_ID }] } })
      : Response.json({ success: true, result: { items: [] } });
  await assert.rejects(
    p.run(),
    /Incomplete version inventory: active deployment version .* missing/u
  );
  assert.equal(p.state.writes, 0);
});

test('R6-2: uppercase duplicate of active version id satisfying total_count refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.versionsResponse = (url) =>
    url.endsWith('/versions?per_page=100')
      ? Response.json({
          success: true,
          result: { items: [{ id: oldId }, { id: oldId.toUpperCase() }] },
          result_info: {
            page: 1,
            per_page: 100,
            count: 2,
            total_count: 2,
            total_pages: 1,
          },
        })
      : Response.json({ success: true, result: { items: [] } });
  await assert.rejects(p.run(), /Duplicate version id/u);
  assert.equal(p.state.writes, 0);
});

test('R6-3: version inventory omitting a version from an earlier deployment in GET /deployments refuses with zero writes', async (t) => {
  const p = setup(t);
  p.state.deployments = [
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      versions: [{ version_id: oldId, percentage: 100 }],
    },
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      versions: [
        { version_id: oldId, percentage: 50 },
        { version_id: PAGE2_ID, percentage: 50 },
      ],
    },
  ];
  p.state.versionsResponse = (url) =>
    url.endsWith('/versions?per_page=100')
      ? Response.json({ success: true, result: { items: [{ id: oldId }] } })
      : Response.json({ success: true, result: { items: [] } });
  await assert.rejects(
    p.run(),
    /Incomplete version inventory: deployed version .* missing/u
  );
  assert.equal(p.state.writes, 0);
});
