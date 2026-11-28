import assert from 'node:assert/strict';
import test from 'node:test';
import { isHistoricalVersionNotFound } from './wave1-native-historical-version.mjs';
import { provenLiveSha } from './wave1-production-supersede.mjs';

// 100146 is a fixture here. Its GET version-detail semantics are unconfirmed.
test('historical version detail distinguishes an exact provider 404 from other responses', async () => {
  const approvedCode = 100146;
  const message = 'Worker version not found.';
  const missing = { success: false, errors: [{ code: approvedCode, message }] };
  const lookup = (response) =>
    isHistoricalVersionNotFound({
      url: 'https://fixture.invalid/versions/version-id',
      fetcher: async () => response,
      approvedCode,
    });
  assert.equal(await lookup(Response.json(missing, { status: 404 })), true);
  assert.equal(await lookup(Response.json(missing)), false);
  assert.equal(await lookup(Response.json(null)), false);
  for (const status of [403, 429, 500, 503]) {
    await assert.rejects(
      lookup(Response.json(missing, { status })),
      /observation failed/u
    );
  }
  await assert.rejects(
    lookup(new Response('<html>Missing</html>', { status: 404 })),
    SyntaxError
  );
  for (const body of [
    { error: message },
    { ...missing, success: true },
    { ...missing, errors: [...missing.errors, ...missing.errors] },
    { ...missing, errors: [{ code: 10007, message }] },
    {
      ...missing,
      errors: [{ code: approvedCode, message: 'Worker not found' }],
    },
  ]) {
    await assert.rejects(
      lookup(Response.json(body, { status: 404 })),
      /Unrecognized missing/u
    );
  }
});

test('serving SHA proof accepts a case alias of the accepted receipt version UUID', async () => {
  const versionId = 'ab000000-0000-0000-0000-000000000001';
  const sha = 'a'.repeat(40);
  const options = {
    deployment: {
      versions: [{ version_id: versionId.toUpperCase(), percentage: 100 }],
    },
    readVersion: async () => ({}),
    baseline: { versionId, sha },
  };
  assert.equal(await provenLiveSha(options), sha);
  await assert.rejects(
    provenLiveSha({
      ...options,
      baseline: { versionId: versionId.replace(/1$/u, '2'), sha },
    }),
    /no accepted receipt/u
  );
});
