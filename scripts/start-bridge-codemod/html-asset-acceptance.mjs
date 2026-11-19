import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { METADATA_RESOURCE_SELECTOR } from '../../packages/start-bridge/src/core/metadata-assets.ts';
import { apexMetadataAssetTypes } from '../../packages/utils/src/common/apex-metadata-assets.ts';

// Parse with the same HTML standard implementation as workerd. In particular,
// resource-looking text in scripts and comments is not a URL.
const parserWorker = `
export default {
  async fetch(request) {
    const resources = [];
    const add = (element, attribute) => {
      const value = element.getAttribute(attribute);
      if (value) resources.push(value);
    };
    await new HTMLRewriter()
      .on('link[href]', {
        element(element) {
          const rel = element.getAttribute('rel')?.toLowerCase() ?? '';
          if (/(?:^|\\s)(?:stylesheet|modulepreload|preload|prefetch|manifest|icon|mask-icon|apple-touch-icon(?:-precomposed)?)(?:\\s|$)/u.test(rel))
            add(element, 'href');
        },
      })
      .on('[src]', { element: (element) => add(element, 'src') })
      .on('image[href], use[href]', { element: (element) => add(element, 'href') })
      .on(${JSON.stringify(METADATA_RESOURCE_SELECTOR)}, { element: (element) => add(element, 'content') })
      .on('video[poster]', { element: (element) => add(element, 'poster') })
      .on('object[data]', { element: (element) => add(element, 'data') })
      .transform(new Response(request.body))
      .text();
    return Response.json(resources);
  },
};
`;

export async function assertRenderedAssets(
  t,
  require,
  call,
  pages,
  fetchSharedAsset = fetch
) {
  const wranglerRequire = createRequire(require.resolve('wrangler'));
  const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
  const parser = new Miniflare(
    convertV4MiniflareOptions({
      name: 'html-asset-fixture',
      modules: [
        { type: 'ESModule', path: 'entry.mjs', contents: parserWorker },
      ],
    })
  );
  t.after(() => parser.dispose());
  const checkedSharedAssets = new Set();

  for (const { host, path, base = '', status = 200 } of pages) {
    const page = await call(path, host);
    const document = new URL(path, `https://${host}`);
    assert.equal(page.status, status, document.href);
    assert.match(
      page.headers['content-type'] ?? '',
      /^text\/html\b/u,
      document.href
    );
    const parsed = await parser.dispatchFetch('https://html-fixture.invalid/', {
      method: 'POST',
      body: page.body,
    });
    assert.equal(
      parsed.status,
      200,
      'workerd could not parse the HTML fixture'
    );
    const resources = new Set();
    const escaped = [];
    for (const reference of await parsed.json()) {
      if (reference.startsWith('#')) continue;
      const url = URL.parse(reference, document);
      assert.ok(url, `Invalid resource URL in ${document.href}`);
      url.hash = '';
      const sharedContentTypes = apexMetadataAssetTypes.get(url.href);
      if (sharedContentTypes) {
        if (!checkedSharedAssets.has(url.href)) {
          const result = await fetchSharedAsset(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          });
          await result.body?.cancel();
          assert.equal(result.status, 200, url.href);
          const contentType = result.headers
            .get('content-type')
            ?.split(';', 1)[0];
          assert.ok(
            contentType && sharedContentTypes.includes(contentType),
            `${url.href} returned ${contentType ?? 'no content type'}, expected ${sharedContentTypes.join(' or ')}`
          );
          checkedSharedAssets.add(url.href);
        }
        continue;
      }
      if (url.origin !== document.origin) continue;
      if (base && !url.pathname.startsWith(`${base}/`)) {
        escaped.push(reference);
        continue;
      }
      resources.add(`${url.pathname}${url.search}`);
    }
    assert.equal(
      escaped.length,
      0,
      `${document.href} emitted ${escaped.join(', ')} outside ${base}`
    );
    assert.ok(
      resources.size > 0,
      `${document.href} emitted no same-origin assets`
    );

    for (const resource of resources) {
      const result = await call(resource, host);
      assert.equal(result.status, 200, `${document.href} emitted ${resource}`);
      assert.doesNotMatch(
        result.headers['content-type'] ?? '',
        /^text\/html\b/u,
        `${resource} must serve an asset`
      );
    }
  }
}
