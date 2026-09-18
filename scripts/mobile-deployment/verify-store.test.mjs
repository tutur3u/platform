// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Test-owned fixture overrides for the standalone, uncached signing verifier.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  playReleaseReady,
  testFlightReady,
  verifyPlay,
} from './verify-store.mjs';

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
