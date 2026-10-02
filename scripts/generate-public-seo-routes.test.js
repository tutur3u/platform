const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  discoverRoutes,
  generate,
  getMetadataPaths,
} = require('./generate-public-seo-routes');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuturuuu-seo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps/web/src/app/[locale]/(marketing)'), {
    recursive: true,
  });
  const page = (route, source, metadata) => {
    const directory = path.join(
      root,
      'apps/web/src/app/[locale]/(marketing)',
      route
    );
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'page.tsx'), source);
    if (metadata)
      fs.writeFileSync(path.join(directory, 'layout.tsx'), metadata);
  };
  return { root, page };
}

const metadata = (pathname, extra = '') =>
  `export const generateMetadata = createLocalizedMarketingMetadata({ namespace: 'test', pathname: '${pathname}', ${extra} });`;

test('discovers new public pages while excluding redirects, drafts, dynamic and inherited routes', (t) => {
  const { root, page } = fixture(t);
  page('(landing)', 'export default function Page() {}', metadata('/'));
  page(
    'products/tasks',
    'export default function Page() {}',
    metadata('/products/tasks')
  );
  page(
    'login',
    'export default function Page() {}',
    metadata('/login', 'indexable: false')
  );
  page('pricing', "permanentRedirect('/#pricing')", metadata('/pricing'));
  page(
    'changelog/[slug]',
    'export default function Page() {}',
    metadata('/changelog/example')
  );
  page('private', 'export default function Page() {}', metadata('/'));
  page(
    'page-noindex',
    metadata('/page-noindex', 'indexable: false'),
    metadata('/page-noindex')
  );
  page(
    'unknown-indexability',
    metadata('/unknown-indexability', 'indexable: isPublic'),
    metadata('/unknown-indexability')
  );
  page(
    'custom-noindex',
    'export function generateMetadata() { return { robots: { index: false } }; }',
    metadata('/custom-noindex')
  );
  assert.deepEqual(discoverRoutes(root), ['/', '/products/tasks']);
  generate({ root });
  page(
    'products/forms',
    'export default function Page() {}',
    metadata('/products/forms')
  );
  assert.throws(() => generate({ root, check: true }), /stale/);
  generate({ root });
  assert.deepEqual(generate({ root, check: true }), [
    '/',
    '/products/forms',
    '/products/tasks',
  ]);
  fs.rmSync(
    path.join(root, 'apps/web/src/app/[locale]/(marketing)/products/tasks'),
    { recursive: true }
  );
  assert.deepEqual(generate({ root }), ['/', '/products/forms']);
});

test('ignores redirect mentions in comments, strings and JSX text', (t) => {
  const { root, page } = fixture(t);
  page(
    'about',
    `// redirect('/login')
    const example = "permanentRedirect('/login')";
    export default function Page() { return <div>redirect('/login')</div>; }`,
    metadata('/about')
  );
  assert.deepEqual(discoverRoutes(root), ['/about']);
});

test('discovers declared public pages outside the marketing group, excluding private dynamic routes', (t) => {
  const { root, page } = fixture(t);
  page(
    '../portfolio',
    'export default function Page() {}',
    metadata('/portfolio')
  );
  page('../(auth)/login', '', metadata('/login', 'indexable: false'));
  page('../(dashboard)/[wsId]/private', '', metadata('/[wsId]/private'));
  assert.deepEqual(discoverRoutes(root), ['/portfolio']);
});

test('extracts literal metadata through comments and nested options without treating templates as static routes', () => {
  assert.deepEqual(
    getMetadataPaths(`
    createMarketingMetadata({ title: "A, B }", keywords: ['pathname', '/wrong'], /* note */ pathname: '/about' });
    getMarketingMetadata({ pathname: \`/changelog/\${slug}\` }, locale);
    createMarketingMetadata({ pathname: '/hidden', indexable: false });
    createMarketingMetadata({ pathname: '/unknown', ...options });
    // createMarketingMetadata({ pathname: '/comment' });
  `),
    ['/about']
  );
});

test('rejects legacy public assets that shadow metadata routes', (t) => {
  const { root, page } = fixture(t);
  page('(landing)', '', metadata('/'));
  generate({ root });
  fs.mkdirSync(path.join(root, 'apps/web/public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/web/public/sitemap.xml'), '<urlset/>');
  assert.throws(
    () => generate({ root, check: true }),
    /conflicting public\/sitemap.xml/
  );
  fs.unlinkSync(path.join(root, 'apps/web/public/sitemap.xml'));
  fs.writeFileSync(
    path.join(root, 'apps/web/public/robots.txt'),
    'User-agent: *'
  );
  assert.throws(
    () => generate({ root, check: true }),
    /conflicting public\/robots.txt/
  );
});

test('unknown page metadata exports cannot inherit an indexable layout', (t) => {
  const { root, page } = fixture(t);
  const sources = [
    "export { generateMetadata } from './shared';",
    "export { hidden as metadata } from './shared';",
    'const hidden = {}; export { hidden as generateMetadata };',
    'export const metadata = { robots: { index: false } };',
    "export * from './shared';",
  ];
  sources.forEach((source, index) => {
    page(
      `hidden-${index}`,
      `${source} const unrelated = createMarketingMetadata({ pathname: '/hidden-${index}' });`,
      metadata(`/hidden-${index}`)
    );
  });
  page('public', '// export const metadata = {}', metadata('/public'));
  assert.deepEqual(discoverRoutes(root), ['/public']);
});
