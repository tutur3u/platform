import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { listIosPrereleaseVersions, nextBuildName } from './build-name.mjs';

test('increments the app version by one from TestFlight history', () => {
  const pubspec = 'name: mobile\nversion: 0.11.0+84\n';
  assert.equal(nextBuildName(pubspec, ['0.11.0']), '0.11.1');
  assert.equal(nextBuildName(pubspec, ['0.11.0', '0.11.1']), '0.11.2');
  assert.equal(
    nextBuildName(pubspec, ['0.11.2', '0.10.9', '0.12.0']),
    '0.11.3'
  );
  assert.equal(nextBuildName('version: 0.12.0+85', ['0.11.9']), '0.12.1');
});

test('rejects invalid source versions', () => {
  assert.throws(() => nextBuildName('version: unexpected', []));
});

test('reads all iOS prerelease version pages for the configured app', async () => {
  const originalFetch = globalThis.fetch;
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (requested.length === 1) {
      return Response.json({ data: [{ id: 'app-id' }] });
    }
    if (requested.length === 2) {
      return Response.json({
        data: [{ attributes: { version: '0.11.0' } }],
        links: {
          next: 'https://api.appstoreconnect.apple.com/v1/preReleaseVersions?page=2',
        },
      });
    }
    return Response.json({
      data: [{ attributes: { version: '0.11.1' } }],
    });
  };
  try {
    const versions = await listIosPrereleaseVersions({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      keyId: 'ABCDEFGHIJ',
      issuerId: 'issuer',
    });
    assert.deepEqual(versions, ['0.11.0', '0.11.1']);
    assert.equal(nextBuildName('version: 0.11.0+84', versions), '0.11.2');
    assert.match(requested[1], /filter%5Bplatform%5D=IOS/u);
    assert.match(requested[1], /filter%5Bapp%5D=app-id/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
