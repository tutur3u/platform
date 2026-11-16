import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertHtmlAssetMount,
  assertManifestAssetMount,
} from './asset-mount.mjs';

test('accepts mounted HTML assets and unrelated external product links', () => {
  const assets = assertHtmlAssetMount(`
    <link rel="stylesheet" href="/playground/assets/style.css">
    <link rel="modulepreload" href='/playground/assets/module.js'>
    <script src="/playground/assets/main.js"></script>
    <a href="https://tasks.tuturuuu.com/personal/tasks">Open Tasks</a>
  `);
  assert.equal(assets.size, 3);
});

test('rejects root CSS, scripts and modulepreloads from the failed artifact', () => {
  for (const html of [
    '<link rel="stylesheet" href="/assets/style.css">',
    '<script src="/assets/main.js"></script>',
    '<link rel="modulepreload" href="/assets/module.js">',
    '<script src="//evil.test/playground/assets/main.js"></script>',
    '<script src="/playground/assets/../../assets/main.js"></script>',
    '<main>No assets</main>',
  ])
    assert.throws(() => assertHtmlAssetMount(html));
});

test('checks the RSC client entry and every nested JS/CSS reference', () => {
  const good = {
    cssLinkPrecedence: false,
    clientEntryUrl: '/playground/assets/main.js',
    clientEntryDeps: { js: ['/playground/assets/main.js'], css: [] },
    clientReferenceDeps: {
      sample: {
        js: ['/playground/assets/demo.js'],
        css: ['/playground/assets/style.css'],
      },
    },
  };
  assert.equal(assertManifestAssetMount(good).size, 3);
  assert.throws(() =>
    assertManifestAssetMount({ ...good, clientEntryUrl: '/assets/main.js' })
  );
  assert.throws(() =>
    assertManifestAssetMount({
      ...good,
      clientEntryDeps: { js: [], css: ['/assets/style.css'] },
    })
  );
  assert.throws(() => assertManifestAssetMount({}));
});
