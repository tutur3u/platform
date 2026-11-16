import assert from 'node:assert/strict';

const base = '/playground';

function assertAssetUrl(value) {
  assert.equal(typeof value, 'string', 'Asset URL must be a string');
  assert.ok(
    value.startsWith(`${base}/assets/`),
    `Asset escapes Playground mount: ${value}`
  );
  const url = new URL(value, 'https://tuturuuu.com');
  assert.equal(url.origin, 'https://tuturuuu.com');
  assert.ok(url.pathname.startsWith(`${base}/assets/`));
  return value;
}

export function assertHtmlAssetMount(html) {
  const assets = new Set();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gs)) {
    const value = match[2];
    if (value.includes('/assets/')) assets.add(assertAssetUrl(value));
  }
  assert.ok(assets.size > 0, 'HTML must reference emitted assets');
  return assets;
}

export function assertManifestAssetMount(manifest) {
  assert.ok(manifest && typeof manifest === 'object');
  const { cssLinkPrecedence, ...assetManifest } = manifest;
  assert.ok(
    cssLinkPrecedence === undefined || typeof cssLinkPrecedence === 'boolean',
    'Invalid RSC CSS precedence metadata'
  );
  const assets = new Set();
  function visit(value) {
    if (typeof value === 'string') {
      assets.add(assertAssetUrl(value));
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else {
      assert.ok(
        value && typeof value === 'object',
        'Invalid RSC asset manifest'
      );
      for (const item of Object.values(value)) visit(item);
    }
  }
  visit(assetManifest);
  assert.ok(assets.size > 0, 'RSC manifest must reference emitted assets');
  return assets;
}
