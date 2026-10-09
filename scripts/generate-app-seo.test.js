const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const {
  generate,
  outputs,
  sitemap,
  validateConfig,
} = require('./generate-app-seo');
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

test('detects and removes obsolete copied sitemap assets without changing unrelated files', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'app-seo-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  generate({ root: temporary });
  for (const app of ['calendar', 'tasks', 'track', 'web']) {
    const directory = path.join(temporary, `apps/${app}/public`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'sitemap.xml'),
      '<loc>https://wrong.example/login</loc>'
    );
    fs.writeFileSync(path.join(directory, 'keep.txt'), 'unrelated');
  }
  assert.throws(
    () => generate({ root: temporary, check: true }),
    /Stale app SEO assets/
  );
  const changed = generate({ root: temporary });
  for (const app of ['calendar', 'tasks', 'track', 'web']) {
    assert.ok(changed.includes(`apps/${app}/public/sitemap.xml`));
    assert.equal(
      fs.existsSync(path.join(temporary, `apps/${app}/public/sitemap.xml`)),
      false
    );
    assert.equal(
      fs.readFileSync(
        path.join(temporary, `apps/${app}/public/keep.txt`),
        'utf8'
      ),
      'unrelated'
    );
  }
  assert.deepEqual(generate({ root: temporary, check: true }), []);
});

test('rejects noncanonical hosts, private routes, duplicate paths and oversized sitemaps', () => {
  const valid = {
    origin: 'https://tools.tuturuuu.com',
    localePrefix: 'never',
    publicPaths: ['', 'qr'],
  };
  assert.doesNotThrow(() => validateConfig('tools', valid));
  for (const origin of [
    'http://tools.tuturuuu.com',
    'https://tools.tuturuuu.com/path',
    'https://tools.tuturuuu.com?preview=1',
    'https://user:password@tools.tuturuuu.com',
  ])
    assert.throws(
      () => validateConfig('tools', { ...valid, origin }),
      /Invalid canonical origin/
    );
  for (const publicPaths of [
    ['login'],
    ['api/v1/users'],
    ['checkout'],
    ['shared/task/secret'],
    ['share/document/secret'],
    ['invite/token'],
    ['%2e%2e/qr'],
    ['learn/%2e%2e/account'],
    ['%2fshared/task/secret'],
    ['%73hared/task/secret'],
    ['sh\tared/task/secret'],
    ['invi\nte/token'],
    ['acc\rount/profile'],
    ['sh%09ared/task/secret'],
    ['invi%0ate/token'],
    ['acc%0dount/profile'],
    ['learn/private page'],
    ['learn/private%20page'],
    ['learn/private%00page'],
    [' qr'],
    ['/qr'],
    ['../qr'],
    ['qr?preview=1'],
    ['qr', 'qr'],
  ])
    assert.throws(
      () => validateConfig('tools', { ...valid, publicPaths }),
      /Invalid or duplicate/
    );
  assert.throws(
    () =>
      validateConfig('tools', {
        ...valid,
        publicPaths: Array.from({ length: 50001 }, (_, i) => `p${i}`),
      }),
    /capacity exceeded/
  );
});

test('registers every Next app so new apps cannot silently miss sitemap policy', () => {
  for (const entry of fs.readdirSync(path.join(root, 'apps'), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(root, 'apps', entry.name, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const config = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (config.dependencies?.next || config.devDependencies?.next)
      assert.ok(
        Object.hasOwn(policy, entry.name),
        `Missing SEO policy for ${entry.name}`
      );
  }
});

test('does not advertise authenticated Colab as public search content', () => {
  const html = fs.readFileSync(
    path.join(root, 'apps/colab/index.html'),
    'utf8'
  );
  assert.match(
    html,
    /<meta name="robots" content="noindex, nofollow, nosnippet"\s*\/>/
  );
  assert.equal(
    fs.existsSync(path.join(root, 'apps/colab/public/sitemap.xml')),
    false
  );
});

test('rejects duplicate localized URLs and overlong protocol URLs', () => {
  const config = {
    origin: 'https://nova.tuturuuu.com',
    localePrefix: 'as-needed',
    publicPaths: ['', 'vi'],
  };
  assert.throws(() => validateConfig('nova', config), /duplicate localized/);
  assert.throws(
    () =>
      validateConfig('nova', { ...config, publicPaths: ['a'.repeat(2048)] }),
    /Invalid or duplicate localized/
  );
});
