import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReplace, statusDocument } from './beta-status.mjs';

const base = {
  platform: 'ios',
  store: 'testflight',
  version: '0.27.27',
  build: '1000000',
  label: '0.27.27 (build 1000000)',
  sha: 'a'.repeat(40),
  now: new Date('2026-11-21T00:00:00Z'),
};

test('status documents carry only validated public release facts', () => {
  assert.deepEqual(statusDocument(base), {
    schema: 1,
    platform: 'ios',
    channel: 'beta',
    store: 'testflight',
    version: '0.27.27',
    build: 1000000,
    label: '0.27.27 (build 1000000)',
    sha: 'a'.repeat(40),
    publishedAt: '2026-11-21T00:00:00.000Z',
  });
  for (const change of [
    { platform: 'web' },
    { store: 'google-play-internal' },
    { version: '0.27' },
    { build: '0' },
    { sha: 'main' },
  ])
    assert.throws(() => statusDocument({ ...base, ...change }));
});

test('a late older run never moves a channel backwards', () => {
  const next = statusDocument(base);
  assert.equal(shouldReplace(null, next), true);
  assert.equal(shouldReplace({ build: 999999 }, next), true);
  assert.equal(shouldReplace({ build: 1000000 }, next), true);
  assert.equal(shouldReplace({ build: 1000001 }, next), false);
});

function fakeReleases(
  t,
  { pointer, pointerOk = true, records = [], shard = 2000, padding = 0 } = {}
) {
  const releases = new Map();
  const add = (tag, assets) =>
    releases.set(tag, { id: releases.size + 1, tag, assets });
  if (pointer !== undefined)
    add('app-release-status', [
      {
        id: 90,
        name: 'ios.json',
        state: 'uploaded',
        browser_download_url: `https://dl/ptr`,
      },
    ]);
  if (records.length)
    add(
      `app-release-status-ios-${shard}`,
      records.map((build) => ({
        id: build,
        name: `ios-${build}.json`,
        state: 'uploaded',
        browser_download_url: `https://dl/${build}`,
      }))
    );
  const calls = [];
  const byId = (id) =>
    [...releases.values()].find((release) => release.id === id);
  const request = async (path, { method = 'GET', body } = {}) => {
    calls.push(`${method} ${path}`);
    if (/\/releases\?per_page=/u.test(path)) {
      // Pad with unrelated releases so the shard lands on a later page.
      const page = Number(/[?&]page=(\d+)/u.exec(path)[1]);
      const all = [
        ...Array.from({ length: padding }, (_, i) => ({
          id: 9000 + i,
          tag_name: `v${i}`,
          assets: [],
        })),
        ...[...releases.values()].map((release) => ({
          ...release,
          tag_name: release.tag,
        })),
      ];
      return all.slice((page - 1) * 100, page * 100);
    }
    const tag = /\/releases\/tags\/(.+)$/u.exec(path)?.[1];
    if (tag) {
      if (!releases.has(tag)) {
        const error = new Error('missing');
        error.status = 404;
        throw error;
      }
      return releases.get(tag);
    }
    if (path.endsWith('/releases') && method === 'POST') {
      add(body.tag_name, []);
      return releases.get(body.tag_name);
    }
    const id = Number(/\/releases\/(\d+)$/u.exec(path)?.[1]);
    if (id) return byId(id);
    return null;
  };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push(`${options.method ?? 'GET'} ${url}`);
    if (String(url).includes('uploads.github.com')) {
      const release = byId(Number(/releases\/(\d+)\/assets/u.exec(url)[1]));
      const name = new URL(url).searchParams.get('name');
      release.assets.push({
        id: 500 + release.assets.length,
        name,
        state: 'uploaded',
        browser_download_url: `https://dl/${name}`,
        body: JSON.parse(options.body),
      });
      return new Response('{}', { status: 201 });
    }
    if (url === 'https://dl/ptr')
      return pointerOk
        ? new Response(JSON.stringify({ build: pointer }))
        : new Response('x', { status: 503 });
    const build = Number(/(\d+)(?:\.json)?$/u.exec(String(url))?.[1]);
    return new Response(JSON.stringify({ ...base, build }));
  });
  return { calls, releases, request };
}

test('records are immutable and the pointer only moves forward', async (t) => {
  const { publishStatus } = await import('./beta-status.mjs');
  const document = statusDocument(base);

  const fresh = fakeReleases(t);
  assert.equal(
    await publishStatus({ request: fresh.request, token: 't', document }),
    'published'
  );
  assert.ok(
    fresh.releases
      .get('app-release-status-ios-2000')
      .assets.some((a) => a.name === 'ios-1000000.json')
  );
  assert.ok(
    fresh.releases
      .get('app-release-status')
      .assets.some((a) => a.name === 'ios.json')
  );

  const newer = fakeReleases(t, { pointer: 1000004 });
  assert.equal(
    await publishStatus({ request: newer.request, token: 't', document }),
    'kept'
  );
  assert.ok(!newer.calls.some((call) => call.startsWith('DELETE')));

  const unreadable = fakeReleases(t, { pointer: 1, pointerOk: false });
  await assert.rejects(
    publishStatus({ request: unreadable.request, token: 't', document }),
    /unreadable/
  );
  assert.ok(!unreadable.calls.some((call) => call.startsWith('DELETE')));

  const older = fakeReleases(t, { pointer: 999999 });
  assert.equal(
    await publishStatus({ request: older.request, token: 't', document }),
    'published'
  );
  assert.ok(older.calls.some((call) => call.startsWith('DELETE')));
});

test('a missing pointer is repaired from the highest record, never lowered', async (t) => {
  const { publishStatus } = await import('./beta-status.mjs');
  // Build 1000002 recorded itself, then failed before replacing the pointer.
  const state = fakeReleases(t, { records: [1000002] });
  await publishStatus({
    request: state.request,
    token: 't',
    document: statusDocument(base),
  });
  const pointer = state.releases
    .get('app-release-status')
    .assets.find((asset) => asset.name === 'ios.json');
  assert.equal(pointer.body.build, 1000002);
});

test('record shards stay under the GitHub asset limit', async () => {
  const { recordShardTag, RECORDS_PER_SHARD } =
    await import('./beta-status.mjs');
  assert.ok(RECORDS_PER_SHARD * 1 <= 1000);
  assert.equal(recordShardTag('ios', 1000000), 'app-release-status-ios-2000');
  assert.equal(recordShardTag('ios', 1000499), 'app-release-status-ios-2000');
  assert.equal(recordShardTag('ios', 1000500), 'app-release-status-ios-2001');
});

test('pointer repair finds the highest record in any shard', async (t) => {
  const { publishStatus } = await import('./beta-status.mjs');
  // Build 1001000 (shard 2002) recorded itself, then lost its pointer.
  const state = fakeReleases(t, { records: [1001000], shard: 2002 });
  await publishStatus({
    request: state.request,
    token: 't',
    document: statusDocument(base),
  });
  const pointer = state.releases
    .get('app-release-status')
    .assets.find((asset) => asset.name === 'ios.json');
  assert.equal(pointer.body.build, 1001000);
});

test('pointer repair follows release pagination to the end', async (t) => {
  const { publishStatus } = await import('./beta-status.mjs');
  // 5,100 unrelated releases push the newer shard past page 51.
  const state = fakeReleases(t, {
    records: [1001000],
    shard: 2002,
    padding: 5100,
  });
  await publishStatus({
    request: state.request,
    token: 't',
    document: statusDocument(base),
  });
  const pointer = state.releases
    .get('app-release-status')
    .assets.find((asset) => asset.name === 'ios.json');
  assert.equal(pointer.body.build, 1001000);
});
