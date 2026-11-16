import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isNovaWorkerBuildInfoGet,
  stampNovaWorkerBuildInfo,
} from './worker-build-info.ts';

const SHA = 'a'.repeat(40);

function infoResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function request(url, method = 'GET') {
  return new Request(url, { method });
}

test('worker GET build-info carries commit and platform cloudflare, in place', async () => {
  for (const url of [
    'https://nova.tuturuuu.com/api/build-info',
    'https://nova.ai.vn/api/build-info',
    'https://nova.tutur3u.com/api/build-info?verify=source',
    'https://tuturuuu.com/nova/api/build-info',
  ]) {
    const response = await stampNovaWorkerBuildInfo(
      request(url),
      infoResponse({
        appName: 'nova',
        commitHash: SHA,
        version: '0.43.0',
      })
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(body.commit, SHA);
    assert.equal(body.commitHash, SHA);
    assert.equal(body.platform, 'cloudflare');
    assert.equal(body.appName, 'nova');
  }
});

test('old-host HEAD is not redirected and is not given a body', async () => {
  const head = request('https://nova.tuturuuu.com/api/build-info', 'HEAD');
  const original = infoResponse({ commitHash: SHA });
  assert.equal(isNovaWorkerBuildInfoGet(head), false);
  assert.equal(await stampNovaWorkerBuildInfo(head, original), original);
});

test('an unsealed commit does not claim the cloudflare platform', async () => {
  const response = await stampNovaWorkerBuildInfo(
    request('https://nova.tuturuuu.com/api/build-info'),
    infoResponse({ appName: 'nova', commitHash: 'local' })
  );
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.platform, undefined);
  assert.equal(body.commit, undefined);
  assert.equal(body.error, 'Build commit is not sealed');
});

test('other paths are left unchanged', async () => {
  const original = infoResponse({ commitHash: SHA });
  const response = await stampNovaWorkerBuildInfo(
    request('https://nova.tuturuuu.com/login'),
    original
  );
  assert.equal(response, original);
});

test('the shared Vercel handler source does not hardcode the worker platform', () => {
  const source = readFileSync(
    new URL('../../../packages/utils/src/build-info-route.ts', import.meta.url),
    'utf8'
  );
  assert.equal(source.includes('cloudflare'), false);
  assert.equal(source.includes('commit:'), false);
  const route = readFileSync(
    new URL('../src/app/api/build-info/route.ts', import.meta.url),
    'utf8'
  );
  assert.match(route, /createBuildInfoHandler\('nova'\)/u);
  assert.equal(route.includes('cloudflare'), false);
});

test('the worker wraps build-info before the response policy', () => {
  const source = readFileSync(
    new URL('../start-bridge.config.ts', import.meta.url),
    'utf8'
  );
  const stampAt = source.indexOf('stampNovaWorkerBuildInfo');
  const policyAt = source.indexOf('applyResponsePolicy(request, stamped)');
  assert.ok(stampAt > 0);
  assert.ok(policyAt > stampAt);
});
