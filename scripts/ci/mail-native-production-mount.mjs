import assert from 'node:assert/strict';

const origin = 'https://tuturuuu.com';
const base = '/mail';
const deepPath = '/vi/personal/sent?q=a%2Bb&tag=1&tag=2';

export function mailProductionMountHost(recipe) {
  assert.deepEqual(recipe.mountHosts, [origin]);
  assert.equal(recipe.allowedVars.TTR_ONE_ORIGIN_MAIL, 'shadow');
  return new URL(origin).hostname;
}

function assertNoSharedSessionWrites(response) {
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(
      cookie,
      /^NEXT_LOCALE=(?:en|vi);/u,
      'Anonymous mounted Mail wrote an unexpected cookie'
    );
    assert.match(cookie, /(?:^|;)\s*Path=\/mail(?:;|$)/iu);
    assert.doesNotMatch(cookie, /(?:^|;)\s*Domain=/iu);
  }
}

export async function exerciseMailProductionMount({
  fetchWorker,
  sha,
  readAsset,
}) {
  for (const path of ['/api/build-info', '/mail-other/api/build-info']) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 404, `Path must stay outside Mail: ${path}`);
    assert.deepEqual(response.headers.getSetCookie(), []);
    await response.body?.cancel();
  }

  const info = await fetchWorker(base + '/api/build-info');
  assert.equal(info.status, 200);
  assert.deepEqual(info.headers.getSetCookie(), []);
  assert.equal((await info.json()).commitHash, sha);
  const head = await fetchWorker(base + '/api/build-info', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const rejected = await fetchWorker(base + '/api/build-info', {
    method: 'POST',
  });
  assert.equal(rejected.status, 405);
  await rejected.body?.cancel();

  // Shared mounted login: Web signs in and returns to the mount's own
  // verify-token, which completes the session for the exact in-mount path.
  const expectWebLogin = (response, nextUrl) => {
    assert.equal(response.status, 307);
    assertNoSharedSessionWrites(response);
    const webLogin = new URL(response.headers.get('location'), origin);
    assert.equal(webLogin.origin, origin);
    assert.equal(webLogin.pathname, '/login');
    const returnUrl = new URL(webLogin.searchParams.get('returnUrl'));
    assert.equal(returnUrl.origin, origin);
    assert.equal(returnUrl.pathname, base + '/verify-token');
    assert.equal(returnUrl.searchParams.get('nextUrl'), nextUrl);
  };

  const protectedPage = await fetchWorker(base + deepPath);
  expectWebLogin(protectedPage, deepPath);
  await protectedPage.body?.cancel();

  const login = await fetchWorker(
    `${base}/login?next=${encodeURIComponent(deepPath)}`
  );
  expectWebLogin(login, deepPath);
  await login.body?.cancel();

  const hostile = await fetchWorker(
    `${base}/login?next=${encodeURIComponent('https://evil.example/x')}`
  );
  expectWebLogin(hostile, '/');
  await hostile.body?.cancel();

  const page = await fetchWorker(base + '/not-available');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('cache-control') ?? '', /no-store/u);
  assertNoSharedSessionWrites(page);
  const html = await page.text();
  const assets = new Set();
  for (const [, path] of html.matchAll(
    /(?:href|src)="((?:\/mail)?\/assets\/[^"?#]+)"/gu
  )) {
    assert.ok(
      path.startsWith(base + '/assets/'),
      `Unprefixed Mail asset: ${path}`
    );
    assets.add(path);
  }
  for (const extension of ['.js', '.css', '.woff2']) {
    const path = [...assets].find((candidate) => candidate.endsWith(extension));
    assert.ok(path, `Mounted Mail HTML is missing a ${extension} asset`);
    const response = await fetchWorker(path);
    assert.equal(response.status, 200, `Missing mounted Mail asset: ${path}`);
    assert.match(
      response.headers.get('cache-control') ?? '',
      /max-age=31536000/u
    );
    assert.match(response.headers.get('cache-control') ?? '', /\bimmutable\b/u);
    const expected = await readAsset('client' + path.slice(base.length));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
}
