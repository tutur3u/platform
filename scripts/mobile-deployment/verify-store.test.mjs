import assert from 'node:assert/strict';
import test from 'node:test';
import { playReleaseReady, testFlightReady } from './verify-store.mjs';

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
