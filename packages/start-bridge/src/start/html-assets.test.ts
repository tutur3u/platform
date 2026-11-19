import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { afterAll, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');

function source(path: string) {
  return stripTypeScriptTypes(
    readFileSync(new URL(path, import.meta.url), 'utf8')
  );
}

const worker = new Miniflare(
  convertV4MiniflareOptions({
    name: 'bridge-html-asset-test',
    modules: [
      {
        type: 'ESModule',
        path: 'entry.mjs',
        contents: `
          import { prefixHtmlAssets } from './start/html-assets';
          export default {
            fetch(request) {
              const url = new URL(request.url);
              const base = url.hostname === 'tuturuuu.com' ? '/tools' : '';
              return prefixHtmlAssets(
                new Response(request.body, { headers: { 'Content-Type': 'text/html' } }),
                url,
                base,
                new Set(['/site.webmanifest', '/favicon.svg'])
              );
            },
          };
        `,
      },
      {
        type: 'ESModule',
        path: 'start/html-assets',
        contents: source('./html-assets.ts'),
      },
      {
        type: 'ESModule',
        path: 'core/base-path',
        contents: source('../core/base-path.ts'),
      },
      {
        type: 'ESModule',
        path: 'core/metadata-assets',
        contents: source('../core/metadata-assets.ts'),
      },
    ],
  })
);

afterAll(() => worker.dispose());

it('scopes only owned resource attributes for each request', async () => {
  const body = [
    '<link rel="stylesheet" href="/assets/layout.css" data-rsc-css-href="/assets/layout.css">',
    '<link rel="modulepreload" href="/assets/chunk.js">',
    '<link rel="preload" as="font" href="/assets/font.woff2">',
    '<link rel="manifest" href="/site.webmanifest">',
    '<link rel="icon" href="/favicon.svg">',
    '<meta property="og:image" content="/assets/preview.jpg">',
    '<meta name="twitter:image" content="https://tuturuuu.com/media/logos/og-image.jpg">',
    '<img src="/assets/picture.svg?fit=1#mark">',
    '<link rel="canonical" href="/assets/canonical">',
    '<a href="/assets/navigation">link</a>',
    '<script src="https://cdn.invalid/assets/fixed.js"></script>',
    '<script src="https://%"></script>',
    '<img src="/shared/image.png">',
  ].join('');
  const fetchPage = (url: string) =>
    worker.dispatchFetch(url, { method: 'POST', body });
  const [mounted, root] = await Promise.all([
    fetchPage('https://tuturuuu.com/tools'),
    fetchPage('https://tools.tuturuuu.com/'),
  ]);
  const html = await mounted.text();
  for (const asset of [
    'assets/layout.css',
    'assets/chunk.js',
    'assets/font.woff2',
    'site.webmanifest',
    'favicon.svg',
    'assets/preview.jpg',
    'assets/picture.svg?fit=1#mark',
  ])
    expect(html).toContain(`="/tools/${asset}"`);
  expect(html).toContain('data-rsc-css-href="/tools/assets/layout.css"');
  expect(html).toContain('href="/assets/canonical"');
  expect(html).toContain('href="/assets/navigation"');
  expect(html).toContain('src="https://cdn.invalid/assets/fixed.js"');
  expect(html).toContain('src="https://%"');
  expect(html).toContain('src="/shared/image.png"');
  expect(html).toContain(
    'content="https://tuturuuu.com/media/logos/og-image.jpg"'
  );
  expect(await root.text()).toBe(body);
});
