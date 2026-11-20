import assert from 'node:assert/strict';

const mountOrigin = 'https://tuturuuu.com';
const query = '?tag=1&tag=2&q=a%2Fb';

function assertLocaleCookie(response) {
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 1, 'Expected only the Apps locale cookie');
  const [value, ...attributes] = cookies[0]
    .split(';')
    .map((part) => part.trim());
  assert.match(value, /^NEXT_LOCALE=(?:en|vi)$/u);
  const paths = attributes.filter((part) => /^path=/iu.test(part));
  assert.equal(paths.length, 1, 'Expected one Apps locale cookie path');
  assert.match(paths[0], /^path=\/(?:apps)?$/iu);
  const domains = attributes.filter((part) => /^domain=/iu.test(part));
  assert.ok(domains.length <= 1, 'Expected at most one locale cookie domain');
  if (domains.length) assert.match(domains[0], /^domain=\.?tuturuuu\.com$/iu);
}

export function appsProductionMountHost(recipe) {
  assert.deepEqual(
    recipe.mountHosts,
    [mountOrigin],
    'Apps production requires exactly the approved apex mount'
  );
  return new URL(mountOrigin).hostname;
}

export async function exerciseAppsProductionMount(fetchWorker, readAsset) {
  for (const path of ['/', '/apps-other']) {
    const refused = await fetchWorker(path);
    assert.equal(refused.status, 404, `${path} must be outside the Apps mount`);
    assert.deepEqual(refused.headers.getSetCookie(), []);
    await refused.body?.cancel();
  }

  const encodedSlash = await fetchWorker('/apps/%2F%2Fevil.example');
  assert.equal(encodedSlash.status, 404, 'Encoded slashes must not redirect');
  assert.equal(encodedSlash.headers.get('location'), null);
  await encodedSlash.body?.cancel();

  const resources = new Set();
  for (const path of ['/apps', '/apps/']) {
    const page = await fetchWorker(`${path}${query}`);
    assert.equal(page.status, 200, `${path} must render the Apps catalogue`);
    assert.match(page.headers.get('cache-control') ?? '', /no-store/u);
    assertLocaleCookie(page);
    const html = await page.text();
    for (const slug of ['drive', 'calendar']) {
      assert.ok(
        html.includes(`href="/apps/${slug}"`),
        `Missing mounted ${slug} launcher`
      );
    }
    for (const [, asset] of html.matchAll(
      /(?:href|src)="((?:\/apps)?\/assets\/[^"]+)"/gu
    )) {
      assert.ok(
        asset.startsWith('/apps/assets/'),
        `Unprefixed Apps asset: ${asset}`
      );
      resources.add(asset);
    }
  }

  for (const extension of ['.css', '.js']) {
    const asset = [...resources].find((path) => path.endsWith(extension));
    assert.ok(asset, `Missing mounted Apps ${extension} asset`);
    const expected = await readAsset(`client${asset.slice('/apps'.length)}`);
    const response = await fetchWorker(asset);
    assert.equal(response.status, 200, `Missing emitted Apps asset: ${asset}`);
    assert.ok(
      Buffer.from(await response.arrayBuffer()).equals(expected),
      `Apps asset differs from sealed bytes: ${asset}`
    );
  }

  for (const [path, target] of [
    [`/apps/en${query}`, `${mountOrigin}/apps${query}`],
    [
      `/apps/drive/a%2Fb${query}`,
      `https://drive.tuturuuu.com/a%2Fb${query}&source=apps`,
    ],
  ]) {
    const redirect = await fetchWorker(path);
    assert.equal(redirect.status, 307, `${path} must redirect`);
    assert.equal(
      redirect.headers.get('location'),
      target,
      `${path} redirect target`
    );
    assert.match(redirect.headers.get('cache-control') ?? '', /no-store/u);
    assertLocaleCookie(redirect);
    await redirect.body?.cancel();
  }
}
