import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { accessFixture } from './emitted-access-fixture.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { JSDOM } = require('jsdom');
const messageCopy = Object.fromEntries(
  await Promise.all(
    ['en', 'vi'].map(async (locale) => [
      locale,
      JSON.parse(
        await readFile(
          new URL(`../messages/${locale}.json`, import.meta.url),
          'utf8'
        )
      ),
    ])
  )
);
const base = 'https://tutur3u.com';
const secret = 'disposable-emitted-worker-proof-secret';
const upstream = 'https://tuturuuu-next-fixture.vercel.app';
const ref = 'fxefojytwimjiqxseqag';
const bypass = 'disposable-emitted-vercel-bypass-0001';
const access = accessFixture();

const legalPages = [
  { slug: 'privacy', seoKey: 'privacy' },
  { slug: 'terms', seoKey: 'terms' },
  { slug: 'acceptable-use', seoKey: 'acceptable_use' },
  { slug: 'legal/dpa', seoKey: 'legal_dpa' },
  { slug: 'legal/sla', seoKey: 'legal_sla' },
  { slug: 'legal/subprocessors', seoKey: 'legal_subprocessors' },
  { slug: 'community-guidelines', seoKey: 'community_guidelines' },
];

const securityPages = [
  { slug: 'security/policy', kind: 'security-policy' },
  { slug: 'security/bug-bounty', kind: 'bug-bounty' },
];

function assertLegalMetadata(html, path) {
  const document = new JSDOM(html).window.document;
  const locale = path.startsWith('/vi/') ? 'vi' : 'en';
  const page = [...legalPages, ...securityPages].find(({ slug }) =>
    path.endsWith(`/${slug}`)
  );
  assert.ok(page, `no canonical metadata fixture for ${path}`);
  const copy =
    'kind' in page
      ? messageCopy[locale][page.kind].meta
      : messageCopy[locale].marketingSeo[page.seoKey];
  const english = `https://tuturuuu.com/${page.slug}`;
  const vietnamese = `https://tuturuuu.com/vi/${page.slug}`;
  const canonical = locale === 'vi' ? vietnamese : english;
  const content = (name) =>
    document.head.querySelector(`meta[name="${name}"]`)?.content;
  assert.equal(document.title, `${copy.title} | Tuturuuu`, path);
  assert.equal(content('description'), copy.description, path);
  assert.equal(content('robots'), 'noindex, nofollow', path);
  assert.deepEqual(
    [...document.head.querySelectorAll('link[rel="canonical"]')].map(
      (link) => link.href
    ),
    [canonical],
    path
  );
  assert.deepEqual(
    Object.fromEntries(
      [
        ...document.head.querySelectorAll('link[rel="alternate"][hreflang]'),
      ].map((link) => [link.hreflang, link.href])
    ),
    { 'en-US': english, 'vi-VN': vietnamese, 'x-default': english },
    path
  );
  assert.deepEqual(
    Object.fromEntries(
      [...document.head.querySelectorAll('meta[property^="og:"]')].map(
        (tag) => [tag.getAttribute('property'), tag.content]
      )
    ),
    {
      'og:type': 'website',
      'og:url': canonical,
      'og:locale': locale === 'vi' ? 'vi_VN' : 'en_US',
      'og:locale:alternate': locale === 'vi' ? 'en_US' : 'vi_VN',
      'og:site_name': 'Tuturuuu',
      'og:title': copy.title,
      'og:description': copy.description,
      'og:image': 'https://tuturuuu.com/media/logos/og-image.jpg',
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:alt': copy.title,
    },
    path
  );
  assert.deepEqual(
    Object.fromEntries(
      [...document.head.querySelectorAll('meta[name^="twitter:"]')].map(
        (tag) => [tag.name, tag.content]
      )
    ),
    {
      'twitter:card': 'summary_large_image',
      'twitter:title': copy.title,
      'twitter:description': copy.description,
      'twitter:image': 'https://tuturuuu.com/media/logos/og-image.jpg',
      'twitter:creator': '@tuturuuu',
      'twitter:site': '@tuturuuu',
    },
    path
  );
  document.defaultView.close();
}

const description =
  'emitted Web candidate on workerd with outbound fixtures only';
test(description, { timeout: 30000 }, async (t) => {
  const { config, configPath } = readNativeRuntimeConfig(root);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers, {});
  assert.equal(config.routes, undefined);
  assert.equal(config.vars.WEB_START_CANDIDATE, 'off');
  assert.equal(config.vars.WEB_START_NATIVE_LEGAL, 'off');
  assert.equal(config.vars.WEB_START_NATIVE_SECURITY, 'off');
  const entry = resolve(dirname(configPath), config.main);
  assert.match(await readFile(entry, 'utf8'), /Web candidate disabled/u);
  const modules = [
    entry,
    ...(await readdir(dirname(configPath), { recursive: true }))
      .filter((file) => /\.m?js$/u.test(file))
      .map((file) => resolve(dirname(configPath), file))
      .filter((file) => file !== entry),
  ].map((path) => ({ type: 'ESModule', path }));
  const egress = [];
  let attest = true;
  function instance(bindings) {
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        name: 'web-candidate',
        modules,
        modulesRoot: dirname(configPath),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings,
        outboundService: async (request) => {
          if (request.url === access.certsUrl)
            return Response.json(access.jwks);
          egress.push(request.url);
          assert.equal(
            new URL(request.url).origin,
            upstream,
            'Unexpected egress'
          );
          assert.match(
            request.headers.get('x-tuturuuu-origin-auth'),
            /^hmac-v1;/u
          );
          assert.equal(request.headers.get('cookie'), 'sb-auth=fixture');
          // N13/N17 on real workerd: client Access, server-owned and Vercel
          // control headers never reach Next; only the Worker's bypass does.
          for (const name of [
            'cf-access-jwt-assertion',
            'cf-access-client-id',
            'x-tuturuuu-runtime',
            'x-forwarded-prefix',
            'x-vercel-set-bypass-cookie',
          ])
            assert.equal(request.headers.has(name), false, name);
          assert.equal(
            request.headers.get('x-vercel-protection-bypass'),
            bypass
          );
          assert.doesNotMatch(new URL(request.url).search, /vercel/iu);
          const headers = new Headers({
            'content-type': 'text/event-stream',
            'service-worker-allowed': '/',
            'retry-after': '5',
          });
          if (attest) headers.set('x-tuturuuu-staging-supabase-ref', ref);
          headers.append(
            'set-cookie',
            'sb-auth.0=one; Path=/; Secure; HttpOnly'
          );
          headers.append(
            'set-cookie',
            'sb-auth.1=two; Path=/; Secure; HttpOnly'
          );
          headers.append('set-cookie', '_vercel_jwt=minted; Path=/; Secure');
          headers.set('x-vercel-id', 'fixture');
          return new Response(`Next fixture:${await request.text()}`, {
            status: 429,
            headers,
          });
        },
      })
    );
    t.after(() => worker.dispose());
    return worker;
  }
  const admitted = {
    ...access.bindings,
    NEXT_FALLBACK_ORIGIN: upstream,
    TRUSTED_PROXY_ORIGIN_SECRET: secret,
    VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
  };
  const disabled = instance(config.vars);
  const enabled = instance({
    ...config.vars,
    WEB_START_CANDIDATE: 'staging',
    WEB_START_NATIVE_LEGAL: 'on',
    WEB_START_NATIVE_SECURITY: 'on',
    ...admitted,
  });
  const rollback = instance({
    ...config.vars,
    WEB_START_CANDIDATE: 'staging',
    WEB_START_NATIVE_LEGAL: 'off',
    WEB_START_NATIVE_SECURITY: 'off',
    ...admitted,
  });
  const securityRollback = instance({
    ...config.vars,
    WEB_START_CANDIDATE: 'staging',
    WEB_START_NATIVE_LEGAL: 'on',
    WEB_START_NATIVE_SECURITY: 'off',
    ...admitted,
  });
  const securityOnly = instance({
    ...config.vars,
    WEB_START_CANDIDATE: 'staging',
    WEB_START_NATIVE_LEGAL: 'off',
    WEB_START_NATIVE_SECURITY: 'on',
    ...admitted,
  });
  const headers = {
    'cf-connecting-ip': '203.0.113.10',
    cookie: 'CF_Authorization=user; sb-auth=fixture; CF_AppSession=s',
    'cf-access-jwt-assertion': access.token(),
    'cf-access-client-id': 'client-supplied',
    'x-tuturuuu-runtime': 'forged',
    'x-tuturuuu-origin-auth': 'forged',
    'x-forwarded-prefix': '/evil',
    'x-vercel-set-bypass-cookie': 'true',
  };
  await t.test(
    'default-off emitted artifact rejects pages, assets, APIs and the Start probe',
    async () => {
      for (const path of [
        '/',
        '/assets/index.js',
        '/api/a',
        '/__web1',
        '/vi/privacy',
        '/vi/legal/dpa',
        '/community-guidelines',
        '/security/policy',
        '/vi/security/bug-bounty',
        '/serwist/sw.js',
      ]) {
        const response = await disabled.dispatchFetch(`${base}${path}`, {
          headers,
        });
        assert.equal(response.status, 503);
        assert.equal(
          response.headers.get('strict-transport-security'),
          'max-age=31536000'
        );
      }
      assert.deepEqual(egress, []);
    }
  );
  await t.test('the actual Start server route handles its probe', async () => {
    const response = await enabled.dispatchFetch(`${base}/__web1`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'web',
      status: 'candidate',
      pages: 'Next-fallback',
    });
    assert.deepEqual(egress, []);
  });
  await t.test(
    'native public policy documents SSR in both languages without egress or session writes',
    async () => {
      for (const path of legalPages.flatMap(({ slug }) => [
        `/${slug}`,
        `/vi/${slug}`,
      ])) {
        const before = egress.length;
        const response = await enabled.dispatchFetch(base + path, { headers });
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get('x-tuturuuu-web-renderer'),
          'native-Start'
        );
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.has('set-cookie'), false);
        assert.match(
          response.headers.get('content-security-policy'),
          /frame-ancestors 'none'/u
        );
        const html = await response.text();
        assert.match(
          html,
          path.startsWith('/vi/') ? /<html lang="vi"/u : /<html lang="en"/u
        );
        assertLegalMetadata(html, path);
        assert.match(html, /<h1>/u);
        assert.match(html, /id="section-1"/u);
        assert.match(html, /mailto:legal@tuturuuu.com/u);
        assert.doesNotMatch(html, /<script(?:\s|>)/u);
        assert.equal(egress.length, before);
        const head = await enabled.dispatchFetch(base + path, {
          method: 'HEAD',
          headers,
        });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
      }
    }
  );
  await t.test(
    'route rollback reaches only the attested Next fixture with the original query',
    async () => {
      const response = await rollback.dispatchFetch(
        `${base}/vi/legal/dpa?raw=%2f&x=1&x=2`,
        { headers }
      );
      assert.equal(response.status, 429);
      assert.equal(
        response.headers.get('x-tuturuuu-web-renderer'),
        'Next-fallback'
      );
      assert.equal(egress.at(-1), `${upstream}/vi/legal/dpa?raw=%2f&x=1&x=2`);
    }
  );

  await t.test(
    'security documents render script-free with independent rollback',
    async () => {
      for (const locale of ['en', 'vi']) {
        for (const { kind, slug } of securityPages) {
          const copy = messageCopy[locale][kind];
          for (const prefix of locale === 'vi' ? ['/vi'] : ['', '/en']) {
            const path = `${prefix}/${slug}`;
            const before = egress.length;
            const response = await securityOnly.dispatchFetch(base + path, {
              headers,
            });
            assert.equal(response.status, 200);
            assert.equal(
              response.headers.get('x-tuturuuu-web-renderer'),
              'native-Start'
            );
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(
              response.headers.get('x-robots-tag'),
              'noindex, nofollow'
            );
            assert.equal(response.headers.has('set-cookie'), false);
            assert.match(
              response.headers.get('content-security-policy'),
              /default-src 'none'/u
            );
            const html = await response.text();
            assertLegalMetadata(html, path);
            const document = new JSDOM(html).window.document;
            assert.equal(document.documentElement.lang, locale);
            assert.equal(
              document.querySelector('h1').textContent,
              `${copy.hero.title_prefix} ${copy.hero.title_highlight}`
            );
            assert.ok(
              document.body.textContent.includes(
                kind === 'security-policy'
                  ? copy.rules.items.no_data_access
                  : copy.researchers.vapour.note
              )
            );
            assert.equal(
              document.querySelectorAll('script, [style]').length,
              0
            );
            document.defaultView.close();
            assert.equal(egress.length, before);
            const head = await securityOnly.dispatchFetch(base + path, {
              method: 'HEAD',
              headers,
            });
            assert.equal(head.status, 200);
            assert.equal(await head.text(), '');
            const fallback = await securityRollback.dispatchFetch(
              `${base}${path}?keep=%2f`,
              { headers }
            );
            assert.equal(
              fallback.headers.get('x-tuturuuu-web-renderer'),
              'Next-fallback'
            );
            assert.equal(egress.at(-1), `${upstream}${path}?keep=%2f`);
          }
        }
      }
      const legal = await securityRollback.dispatchFetch(`${base}/privacy`, {
        headers,
      });
      assert.equal(
        legal.headers.get('x-tuturuuu-web-renderer'),
        'native-Start'
      );
      const before = egress.length;
      for (const path of ['/security/policy', '/vi/security/bug-bounty']) {
        const rejected = await securityOnly.dispatchFetch(
          `https://tuturuuu.com${path}`,
          { headers }
        );
        assert.equal(rejected.status, 503);
      }
      assert.equal(egress.length, before);
    }
  );
  await t.test(
    'Next fallback preserves body, error, cookie and service-worker boundaries',
    async () => {
      const response = await enabled.dispatchFetch(
        `${base}/api/a?x=1&x=2&raw=%2f`,
        { method: 'POST', body: 'write-once', headers }
      );
      assert.equal(response.status, 429);
      assert.equal(await response.text(), 'Next fixture:write-once');
      // N17: the minted _vercel_jwt and x-vercel-* never reach the browser.
      assert.equal(response.headers.getSetCookie().length, 2);
      assert.ok(
        response.headers.getSetCookie().every((c) => !c.startsWith('_vercel'))
      );
      assert.equal(response.headers.has('x-vercel-id'), false);
      assert.equal(response.headers.get('retry-after'), '5');
      assert.equal(egress.at(-1), `${upstream}/api/a?x=1&x=2&raw=%2f`);
      const sw = await enabled.dispatchFetch(`${base}/serwist/sw.js?v=exact`, {
        headers,
      });
      assert.equal(sw.headers.get('service-worker-allowed'), '/');
      assert.equal(egress.at(-1), `${upstream}/serwist/sw.js?v=exact`);
    }
  );
  await t.test(
    'wrong project and canonical hosts fail closed in the emitted Worker',
    async () => {
      attest = false;
      const response = await enabled.dispatchFetch(`${base}/login`, {
        headers,
      });
      assert.equal(response.status, 502);
      assert.equal(response.headers.has('set-cookie'), false);
      const calls = egress.length;
      assert.equal(
        (await enabled.dispatchFetch('https://tuturuuu.com/login', { headers }))
          .status,
        503
      );
      assert.equal(egress.length, calls);
    }
  );
  await t.test(
    'Access JWTs are verified by the emitted Worker itself (N19)',
    async () => {
      const calls = egress.length;
      for (const jwt of [
        null,
        access.token({ key: access.otherKey }),
        access.token({ aud: 'web-other-aud' }),
        access.token({ exp: -60 }),
        'not.a.jwt',
      ]) {
        const denied = await rollback.dispatchFetch(`${base}/login`, {
          headers: {
            'cf-connecting-ip': '203.0.113.10',
            ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}),
          },
        });
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.has('set-cookie'), false);
      }
      assert.equal(egress.length, calls, 'Denied requests reached Next');
    }
  );
  await t.test(
    'OPTIONS is answered in the Worker with zero Next calls (N20)',
    async () => {
      const calls = egress.length;
      for (const path of ['/api/v1/workspaces', '/login', '/privacy']) {
        // No Access JWT: under S1 only preflights still reach the Worker.
        const response = await rollback.dispatchFetch(`${base}${path}`, {
          method: 'OPTIONS',
          headers: {
            origin: 'https://calendar.staging.tutur3u.com',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
          },
        });
        assert.equal(response.status, 204);
        assert.equal(await response.text(), '');
        assert.equal(
          response.headers.get('access-control-allow-origin'),
          'https://calendar.staging.tutur3u.com'
        );
      }
      assert.equal(egress.length, calls, 'OPTIONS reached Next');
    }
  );
});
