import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCssAssets,
  extractHtmlAssets,
  mimeMatches,
  reportAssetSmokeRejection,
  resolveAssetSmokePlan,
  smokeAssets,
} from './asset-smoke.mjs';

const HTML = `<!doctype html>
<link rel="stylesheet" href="/roadmap/assets/styles-Abcd1234.css">
<link rel="modulepreload" href="/roadmap/assets/index-Abcd1234.js">
<script type="module" src="/roadmap/assets/index-Abcd1234.js"></script>
<script src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>`;

const CSS = '@font-face{src:url(./inter-Abcd1234.woff2)}';

function okDocument(body = HTML) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

test('extraction keeps css, js and fonts and ignores data urls and images', () => {
  assert.deepEqual(
    extractHtmlAssets(HTML).map((item) => item.kind),
    ['css', 'js', 'js', 'js']
  );
  assert.deepEqual(
    extractCssAssets(`${CSS} url("data:image/svg+xml,a") url(logo.png)`),
    [{ reference: './inter-Abcd1234.woff2', kind: 'font' }]
  );
  assert.equal(mimeMatches('css', 'text/css; charset=utf-8'), true);
  assert.equal(mimeMatches('css', 'text/html'), false);
  assert.equal(mimeMatches('js', 'application/javascript'), true);
  assert.equal(mimeMatches('font', 'font/woff2'), true);
  assert.equal(mimeMatches('font', 'application/octet-stream'), false);
});

test('D79: a stylesheet 404 with an HTML body fails the asset smoke', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.endsWith('.css')) {
      return new Response('<html>missing</html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (target.endsWith('.js')) {
      return new Response('export {}', {
        status: 200,
        headers: { 'content-type': 'text/javascript' },
      });
    }
    return okDocument();
  };
  const result = await smokeAssets({
    pages: ['https://tuturuuu.com/roadmap/'],
    canonicalOrigin: 'https://tuturuuu.com',
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some(
      (failure) =>
        failure.includes('/roadmap/assets/styles-Abcd1234.css') &&
        failure.includes('404') &&
        failure.includes('text/html')
    )
  );
  const report = reportAssetSmokeRejection(result);
  assert.match(report, /^D79 asset smoke rejected:/);
  console.error(report);
});

test('a passing page accepts one redirect and a font referenced by CSS', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    seen.push(target);
    if (target === 'https://roadmap.tuturuuu.com/') {
      return new Response(null, {
        status: 301,
        headers: { location: 'https://tuturuuu.com/roadmap/' },
      });
    }
    if (target === 'https://tuturuuu.com/roadmap/') return okDocument();
    if (target.endsWith('.css')) {
      return new Response(CSS, {
        status: 200,
        headers: { 'content-type': 'text/css; charset=utf-8' },
      });
    }
    if (target.endsWith('.js')) {
      return new Response('export {}', {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      });
    }
    if (target.endsWith('.woff2')) {
      return new Response('font', {
        status: 200,
        headers: { 'content-type': 'font/woff2' },
      });
    }
    return new Response('no', { status: 500 });
  };
  const result = await smokeAssets({
    pages: [
      {
        url: 'https://roadmap.tuturuuu.com/',
        status: 301,
        location: 'https://tuturuuu.com/roadmap/',
      },
    ],
    canonicalOrigin: 'https://tuturuuu.com',
    fetchImpl,
  });
  assert.deepEqual(result.failures, []);
  assert.equal(
    seen.includes('https://static.cloudflareinsights.com/beacon.min.js/v1'),
    false
  );
  assert.ok(
    seen.includes('https://tuturuuu.com/roadmap/assets/inter-Abcd1234.woff2')
  );
});

test('a satellite 301 that lands on a second 308 is a redirect chain', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target === 'https://roadmap.tuturuuu.com/roadmap') {
      return new Response(null, {
        status: 301,
        headers: { location: 'https://tuturuuu.com/roadmap' },
      });
    }
    if (target === 'https://tuturuuu.com/roadmap') {
      return new Response(null, {
        status: 308,
        headers: { location: '/roadmap/' },
      });
    }
    if (target === 'https://tuturuuu.com/roadmap/') return okDocument();
    if (target.endsWith('.css') || target.endsWith('.js')) {
      return new Response('ok', {
        status: 200,
        headers: {
          'content-type': target.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
        },
      });
    }
    return new Response('no', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });
  };
  const result = await smokeAssets({
    pages: [
      {
        url: 'https://roadmap.tuturuuu.com/roadmap',
        status: 301,
        location: 'https://tuturuuu.com/roadmap/',
      },
    ],
    canonicalOrigin: 'https://tuturuuu.com',
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.includes('redirect chain'))
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.includes('expected https://tuturuuu.com/roadmap/')
    )
  );
});

test('an empty document and a soft HTML asset response fail', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('.css')) {
      return new Response('<html>not css</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (String(url).endsWith('/empty')) return okDocument('<html></html>');
    return okDocument('<link rel="stylesheet" href="/app.css">');
  };
  const result = await smokeAssets({
    pages: ['https://tuturuuu.com/empty', 'https://tuturuuu.com/app'],
    canonicalOrigin: 'https://tuturuuu.com',
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.includes('no css, js or font'))
  );
  assert.ok(result.failures.some((failure) => failure.includes('text/html')));
});

test('a preview base does not fetch production satellite pages', () => {
  const plan = resolveAssetSmokePlan(
    {
      canonicalOrigin: 'https://tuturuuu.com',
      pages: [{ path: '/roadmap/', status: 200 }],
      satellitePages: ['https://roadmap.tuturuuu.com/'],
    },
    'https://roadmap-preview.example'
  );
  assert.equal(plan.canonicalOrigin, 'https://roadmap-preview.example');
  assert.deepEqual(plan.pages, [
    { url: 'https://roadmap-preview.example/roadmap/', status: 200 },
  ]);
  const production = resolveAssetSmokePlan(
    {
      canonicalOrigin: 'https://tuturuuu.com',
      pages: ['/roadmap/'],
      satellitePages: [
        {
          url: 'https://roadmap.tuturuuu.com/roadmap',
          status: 301,
          location: 'https://tuturuuu.com/roadmap/',
        },
      ],
    },
    'https://tuturuuu.com'
  );
  assert.equal(production.pages.length, 2);
  assert.equal(production.pages[1].location, 'https://tuturuuu.com/roadmap/');
});
