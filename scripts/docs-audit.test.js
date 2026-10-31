const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { audit, publicSafetyErrors } = require('./docs-audit');
const {
  collect,
  generate,
  parseLock,
  routePath,
} = require('./generate-docs-inventory');

test('every documentation page, link, navigation entry, and asset resolves', () => {
  const result = audit();
  assert.deepEqual(result.errors, []);
  assert.ok(result.pageCount > 300);
});

test('repository inventories are reproducible and omit paused implementation trees', () => {
  assert.deepEqual(generate({ check: true }), []);
  const { apps, manifests } = collect();
  assert.ok(apps.some((app) => app.name === 'web' && app.routes.length > 0));
  assert.ok(
    manifests.every(
      (entry) =>
        !['apps/backend', 'apps/tanstack-web'].includes(entry.directory)
    )
  );
  for (const name of ['backend', 'tanstack-web']) {
    const app = apps.find((entry) => entry.name === name);
    assert.equal(app.paused, true);
    assert.deepEqual(app.routes, []);
  }
});

test('route URLs omit groups and preserve dynamic parameters', () => {
  assert.equal(
    routePath('[locale]/(dashboard)/[wsId]/tasks/page.tsx'),
    '/[locale]/[wsId]/tasks'
  );
  assert.equal(routePath('api/v1/items/[id]/route.ts'), '/api/v1/items/[id]');
  assert.deepEqual(
    parseLock(
      '{"text":"comma, } bracket, ]", "packages": {"name": ["name@1",],},}'
    ),
    {
      text: 'comma, } bracket, ]',
      packages: { name: ['name@1'] },
    }
  );
});

test('audit catches broken and unregistered pages without treating examples as links', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const docs = path.join(fixture, 'apps/docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(
    path.join(docs, 'docs.json'),
    JSON.stringify({ navigation: { pages: ['home'] } })
  );
  const header = '---\ntitle: Home\ndescription: Test\n---\n';
  fs.writeFileSync(
    path.join(docs, 'home.mdx'),
    `${header}\n[Missing](/missing)\n\`<Link href="/example">\`\n`
  );
  fs.writeFileSync(path.join(docs, 'orphan.mdx'), header);
  const result = audit(fixture);
  assert.ok(result.errors.some((error) => error.includes('/missing')));
  assert.ok(
    result.errors.some((error) => error.includes('Unregistered page: orphan'))
  );
  assert.ok(result.errors.every((error) => !error.includes('/example')));
});

test('public-safety guard flags internal identifiers without echoing them', () => {
  const unsafe = [
    'See SR-123 for the finding.',
    'Run it on `/Users/someone/work/repo/`.',
    'ssh skr-example',
    'https://worker.account.workers.dev/health',
    'Connect to 192.168.1.20 or host.tailnet-name.ts.net',
    'Easy Center asked for this.',
    `token ghp_${'a'.repeat(36)}`,
  ];
  const errors = publicSafetyErrors(unsafe.join('\n'), 'page.mdx');
  assert.equal(errors.length, unsafe.length + 1);
  assert.ok(errors.every((error) => error.startsWith('Public-safety (')));
  assert.ok(
    errors.every((error) => !/SR-123|someone|skr-example|ghp_/.test(error))
  );
});

test('public-safety guard allows placeholders and public examples', () => {
  const safe = [
    'Use `<repo-root>/apps/docs` and `ssh <build-mac>`.',
    'https://<worker>.<account-subdomain>.workers.dev/health',
    'The emulator reaches the host at 10.0.2.2; the Vietnamese memo says Thanh toan.',
    'Rows SRC-1 and the SR column are not register IDs; /home/route.ts is a route.',
  ];
  assert.deepEqual(publicSafetyErrors(safe.join('\n'), 'page.mdx'), []);
});
