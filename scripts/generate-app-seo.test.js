const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { generate, outputs, sitemap } = require('./generate-app-seo');
const policy = require('../packages/utils/src/seo-policy.json');
const root = path.resolve(__dirname, '..');

test('static assets are current, own their host, and omit private sitemaps', () => {
  assert.deepEqual(generate({ check: true }), []);
  for (const [app, config] of Object.entries(policy)) {
    if (app === 'web') continue;
    const map = outputs();
    const xml = map.get(`apps/${app}/public/sitemap.xml`);
    if (!config.publicPaths.length) {
      assert.equal(xml, undefined);
      assert.equal(
        fs.existsSync(path.join(root, `apps/${app}/public/sitemap.xml`)),
        false,
        app
      );
      continue;
    }
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      assert.equal(new URL(match[1]).origin, config.origin, app);
      assert.doesNotMatch(match[1], /\/(?:login|checkout|orders|cart)(?:\/|$)/);
    }
    assert.doesNotMatch(xml, /<lastmod>/);
    assert.doesNotMatch(xml, /\/en(?:\/|<)/);
  }
});

test('stable single-URL apps do not invent language alternatives', () => {
  assert.doesNotMatch(sitemap(policy.tools), /<xhtml:link/);
  const xml = sitemap(policy.nova);
  assert.match(xml, /hreflang="x-default"/);
  assert.match(xml, /<loc>https:\/\/nova\.tuturuuu\.com\/vi\/learn<\/loc>/);
});

test('robots permits crawling noindex and canonical redirects', () => {
  for (const [file, source] of outputs()) {
    if (!file.endsWith('robots.txt')) continue;
    assert.match(source, /Allow: \//);
    assert.doesNotMatch(source, /Disallow:/);
  }
});
