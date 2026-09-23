// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Test-owned fixture overrides for the standalone, uncached signing verifier.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  distributeTestFlightBuild,
  playReleaseReady,
  selectBetaGroups,
  submitExternalBetaReview,
  testFlightReady,
  verifyPlay,
} from './verify-store.mjs';

test('TestFlight beta distribution defaults to all existing groups and can be limited', () => {
  const groups = [
    { id: 'internal', attributes: { name: 'Team' } },
    { id: 'external', attributes: { name: 'RMIT University' } },
  ];
  assert.deepEqual(selectBetaGroups(groups, 'true', 'all'), groups);
  assert.deepEqual(selectBetaGroups(groups, 'true', 'RMIT University'), [
    groups[1],
  ]);
  assert.deepEqual(selectBetaGroups(groups, 'true', 'internal'), [groups[0]]);
  assert.deepEqual(selectBetaGroups(groups, 'false', 'all'), []);
  assert.throws(
    () => selectBetaGroups(groups, 'true', 'missing'),
    /Unknown TestFlight beta group/
  );
});

test('TestFlight distribution assigns missing groups and reads back exact build membership', async () => {
  const groups = [
    { id: 'internal', attributes: { name: 'Team' } },
    { id: 'external', attributes: { name: 'RMIT University' } },
  ];
  const assigned = new Set(['internal']);
  const calls = [];
  const apple = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.includes('/apps/')) return { data: groups };
    if (path === '/v1/builds/build?include=betaGroups') {
      return {
        data: {
          relationships: {
            betaGroups: {
              data: [...assigned].map((id) => ({ id, type: 'betaGroups' })),
            },
          },
        },
      };
    }
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      for (const entry of body.data) assigned.add(entry.id);
      return null;
    }
    throw new Error(`Unexpected App Store Connect request: ${path}`);
  };
  assert.deepEqual(
    await distributeTestFlightBuild(apple, 'app', 'build', {
      enabled: 'true',
      groups: 'all',
    }),
    groups
  );
  assert.equal(
    calls.filter((call) => call.options.method === 'POST').length,
    1
  );
  assert.deepEqual(assigned, new Set(['internal', 'external']));
  assert.equal(
    calls.filter((call) => call.path === '/v1/builds/build?include=betaGroups')
      .length,
    2
  );
});

test('external beta review creates test notes, enables notification, and submits once', async () => {
  const calls = [];
  let submitted = false;
  const apple = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.startsWith('/v1/betaAppReviewSubmissions?')) {
      return {
        data: submitted
          ? [{ attributes: { betaReviewState: 'WAITING_FOR_REVIEW' } }]
          : [],
      };
    }
    if (path.includes('/betaBuildLocalizations?')) return { data: [] };
    if (path.endsWith('/buildBetaDetail')) return { data: { id: 'detail' } };
    if (path === '/v1/betaAppReviewSubmissions') submitted = true;
    return { data: {} };
  };
  await submitExternalBetaReview(apple, 'build', 'Test this release');
  assert.equal(
    calls.filter((call) => call.path === '/v1/betaAppReviewSubmissions').length,
    1
  );
  assert.match(
    calls.find((call) => call.path === '/v1/betaBuildLocalizations').options
      .body,
    /Test this release/
  );
  assert.match(
    calls.find((call) => call.path === '/v1/buildBetaDetails/detail').options
      .body,
    /"autoNotifyEnabled":true/
  );
  calls.length = 0;
  await submitExternalBetaReview(apple, 'build', 'Test this release');
  assert.equal(
    calls.some((call) => call.options.method === 'POST'),
    false
  );
});

test('Play verification cleans up its temporary edit even when track lookup fails', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mobile-store-api-test-'));
  const file = join(root, 'service-account.json');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(
    file,
    JSON.stringify({
      client_email: 'fixture@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    { mode: 0o600 }
  );
  const previous = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH;
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH = file;
  t.after(() => {
    if (previous === undefined)
      delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH;
    else process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET' });
    assert.equal(options.redirect, 'error');
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'fixture-access-token' });
    }
    assert.equal(options.headers.Authorization, 'Bearer fixture-access-token');
    assert.ok(
      url.startsWith(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.tuturuuu.app.mobile/edits'
      )
    );
    if (options.method === 'POST')
      return Response.json({ id: 'temporary-edit' });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json(
      { error: 'private provider diagnostics' },
      { status: 403 }
    );
  });
  await assert.rejects(verifyPlay('101001'), (error) => {
    assert.match(error.message, /Store API request failed \(403/);
    assert.doesNotMatch(error.message, /private provider diagnostics/);
    return true;
  });
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.match(calls.at(-1).url, /\/edits\/temporary-edit$/);
  assert.equal(
    calls.some((call) => call.url.includes(':commit')),
    false
  );
});

test('Google Play verification requires the exact build on completed internal track', () => {
  const release = { status: 'completed', versionCodes: ['101001'] };
  assert.equal(
    playReleaseReady({ track: 'internal', releases: [release] }, '101001'),
    true
  );
  assert.equal(
    playReleaseReady({ track: 'production', releases: [release] }, '101001'),
    false
  );
  assert.equal(
    playReleaseReady({ track: 'internal', releases: [release] }, '101002'),
    false
  );
  assert.equal(
    playReleaseReady(
      { track: 'internal', releases: [{ ...release, status: 'draft' }] },
      '101001'
    ),
    false
  );
  assert.equal(playReleaseReady({ track: 'internal' }, '101001'), false);
});

test('Apple upload and processing success alone do not prove beta distribution', () => {
  const build = { attributes: { processingState: 'VALID', expired: false } };
  assert.equal(
    testFlightReady(build, {
      attributes: { internalBuildState: 'IN_BETA_TESTING' },
    }),
    true
  );
  assert.equal(
    testFlightReady(build, {
      attributes: { internalBuildState: 'READY_FOR_BETA_TESTING' },
    }),
    false
  );
  assert.equal(
    testFlightReady(build, {
      attributes: { internalBuildState: 'MISSING_EXPORT_COMPLIANCE' },
    }),
    false
  );
  assert.equal(
    testFlightReady({ attributes: { processingState: 'PROCESSING' } }, null),
    false
  );
  assert.equal(
    testFlightReady(
      { attributes: { ...build.attributes, expired: true } },
      { attributes: { internalBuildState: 'IN_BETA_TESTING' } }
    ),
    false
  );
});
