import assert from 'node:assert/strict';
import test from 'node:test';
import { COLAB_BUILD_COMMIT } from '../src/server/build-commit.ts';
import {
  colabBuildInfo,
  colabBuildInfoResponse,
} from '../src/server/build-info.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('returns the same 40-hex commit as commit and commitHash', async () => {
  const response = colabBuildInfoResponse('GET', SHA.toUpperCase());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), {
    appName: 'colab',
    commit: SHA,
    commitHash: SHA,
    platform: 'cloudflare',
  });
});

test('does not echo a non-hex value, an email, or the local placeholder', () => {
  for (const value of ['local', 'user@example.com', `${SHA}ff`, 'short']) {
    const body = colabBuildInfo(value);
    assert.equal(body.commit, null);
    assert.equal(body.commitHash, null);
    assert.equal(JSON.stringify(body).includes(value.trim()), false);
  }
});

test('keeps secret and mail field names out of the body', async () => {
  const text = await colabBuildInfoResponse('GET', SHA).text();
  for (const key of [
    'secret',
    'token',
    'password',
    'email',
    'authorization',
    'cookie',
  ]) {
    assert.equal(text.includes(`"${key}"`), false);
  }
});

test('allows anonymous GET, HEAD, and OPTIONS, and rejects other methods', async () => {
  const options = colabBuildInfoResponse('OPTIONS', SHA);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Allow'), 'GET, HEAD, OPTIONS');
  const head = colabBuildInfoResponse('HEAD', SHA);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('cache-control'), 'no-store, max-age=0');
  const post = colabBuildInfoResponse('POST', 'user@example.com');
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD, OPTIONS');
  assert.equal(await post.text(), '');
});

test('ships an empty bake until the deploy job writes a commit', () => {
  assert.equal(COLAB_BUILD_COMMIT, '');
  assert.equal(colabBuildInfo(COLAB_BUILD_COMMIT).commit, null);
});
