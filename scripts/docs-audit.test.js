const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  audit,
  hashTerm,
  hashedTermErrors,
  publicSafetyErrors,
} = require('./docs-audit');
const {
  collect,
  generate,
  parseLock,
  plannedFiles,
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

test('generated reference stays in navigation but opts out of search and LLM indexes', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/docs/docs.json'), 'utf8')
  );
  assert.notEqual(config.seo?.indexing, 'all');
  const navigation = JSON.stringify(config.navigation);
  const files = plannedFiles(root);
  for (const [file, source] of files) {
    if (!file.startsWith('reference/repository/')) continue;
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)[1];
    assert.match(frontmatter, /^noindex: true$/m, file);
    assert.doesNotMatch(frontmatter, /^hidden: true$/m, file);
    assert.ok(
      navigation.includes(JSON.stringify(file.replace(/\.mdx$/, ''))),
      file
    );
  }
  assert.ok(files.size > 0);
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

// Synthetic terms: the real list is hashed in docs-audit.js and never spelled
// out here either.
const TEST_SALT = 'test-salt';
const TEST_TERMS = {
  'fleet host or machine name': [hashTerm('zzhost', TEST_SALT)],
  'customer name without consent': [
    hashTerm('Alpha Bravo', TEST_SALT),
    hashTerm('charlieclinic', TEST_SALT),
  ],
};
const testOptions = { terms: TEST_TERMS, salt: TEST_SALT };

test('public-safety guard flags internal identifiers without echoing them', () => {
  const unsafe = [
    'See SR-123 for the finding.',
    'Run it on `/Users/Someone/work/repo/`.',
    'https://worker.account.workers.dev/health',
    'Connect to 192.168.1.20 or host.tailnet-name.ts.net',
    'Tailnet peer 100.101.102.103',
    `token ghp_${'a'.repeat(36)}`,
    `jwt eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(20)}.sig`,
    `https://${'a'.repeat(20)}.supabase.co`,
    'thread mcp:launch:abc',
    'agent mcp:0123abcd-0000',
    'Mail owner@gmail.com please',
  ];
  const errors = publicSafetyErrors(unsafe.join('\n'), 'page.mdx');
  const labels = new Set(errors.map((error) => error.split(':')[0]));
  assert.ok(labels.size >= 10, [...labels].join('|'));
  assert.ok(errors.every((error) => error.startsWith('Public-safety (')));
  assert.ok(
    errors.every((error) => !/SR-123|Someone|ghp_|eyJ|gmail/.test(error))
  );
  // Each rule fires on its own line.
  for (const [index, line] of unsafe.entries())
    assert.ok(
      publicSafetyErrors(line, 'p.mdx').length >= 1,
      `rule for line ${index}`
    );
});

test('hashed terms are found across line breaks and dashes without echoing them', () => {
  const found = (text) =>
    publicSafetyErrors(text, 'p.mdx', testOptions).filter((error) =>
      /fleet host|customer name/.test(error)
    );
  assert.deepEqual(found('x\nAlpha\n  Bravo asked'), [
    'Public-safety (customer name without consent): p.mdx:2',
  ]);
  assert.equal(found('the alpha-bravo and ALPHA_BRAVO notes').length, 1);
  assert.equal(found('see CharlieClinic page').length, 1);
  assert.equal(found('ssh zzhost-two or zzhost.example').length, 1);
  assert.equal(found('alpha and bravo apart, zzho and zzhos only').length, 0);
  // Machine names also match as the start of a longer single word.
  assert.equal(found('node zzhostubuntu01 is a host').length, 1);
  assert.equal(found('ZZHOSTSTUDIO and zzhost-lan').length, 1);
  // Customer names do not match as prefixes.
  assert.equal(found('charlieclinics and alphabravos').length, 0);
  assert.ok(found('Alpha Bravo').every((error) => !/alpha|bravo/i.test(error)));
  const allowed = new Set(['p.mdx|fleet host or machine name']);
  assert.equal(
    publicSafetyErrors('zzhost', 'p.mdx', { ...testOptions, allowed }).length,
    0
  );
  assert.equal(hashTerm('Alpha Bravo', 'a'), hashTerm('alpha-bravo', 'a'));
  assert.notEqual(hashTerm('alpha', 'a'), hashTerm('alpha', 'b'));
});

test('the guard and its tests spell out no hashed term', () => {
  for (const file of ['docs-audit.js', 'docs-audit.test.js']) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.deepEqual(hashedTermErrors(source, file), [], file);
  }
});

test('public-safety guard allows placeholders and public examples', () => {
  const safe = [
    'Use `<repo-root>/apps/docs` and `ssh <build-mac>`.',
    'https://<worker>.<account-subdomain>.workers.dev/health',
    'https://<staging-project-ref>.supabase.co',
    'The emulator reaches the host at 10.0.2.2.',
    'Rows SRC-1 and the SR column are not register IDs; /home/route.ts is a route.',
    'Contact support@tuturuuu.com or noreply@tuturuuu.com; use `<owner-mailbox>`.',
    'CGNAT-like 100.1.2.3 is a public address.',
  ];
  assert.deepEqual(publicSafetyErrors(safe.join('\n'), 'page.mdx'), []);
});

test('audit also applies the public-safety scan to docs-internal', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const docs = path.join(fixture, 'apps/docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(path.join(fixture, 'docs-internal/build'), { recursive: true });
  fs.writeFileSync(
    path.join(docs, 'docs.json'),
    JSON.stringify({ navigation: { pages: ['home'] } })
  );
  fs.writeFileSync(
    path.join(docs, 'home.mdx'),
    '---\ntitle: Home\ndescription: Test\n---\n'
  );
  fs.writeFileSync(
    path.join(fixture, 'docs-internal/build/runbook.mdx'),
    'Finding SR-123 on 10.1.2.3\n'
  );
  const errors = audit(fixture).errors;
  assert.ok(
    errors.some((error) => error.endsWith('docs-internal/build/runbook.mdx:1'))
  );
  assert.ok(errors.every((error) => !error.includes('Unregistered')));
});

test('staging guard covers docs, plugins and docs-internal and honors the allowlist', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const header = '---\ntitle: Home\ndescription: Test\n---\n';
  const write = (file, text) => {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write(
    'apps/docs/docs.json',
    JSON.stringify({ navigation: { pages: ['home', 'ok'] } })
  );
  write(
    'apps/docs/home.mdx',
    `${header}Use web.tutur3u.com and tuturuuu-web-wave1-staging.\nSet VERCEL_AUTOMATION_BYPASS_SECRET and my.workers.dev.\n`
  );
  write(
    'apps/docs/ok.mdx',
    `${header}Placeholders <app>.tutur3u.com and <sub>.workers.dev pass; AUTH_BYPASS is allowlisted.\n`
  );
  write('plugins/p/ref.md', 'Host calendar.tutur3u.com\n');
  write('docs-internal/runbook.mdx', 'Host web.tutur3u.com\n');
  write(
    'scripts/docs-safety-allowlist.json',
    JSON.stringify({
      entries: [
        {
          path: 'apps/docs/ok.mdx',
          rule: 'bypass secret name',
          reason: 'test',
        },
        { path: 'apps/docs/home.mdx', rule: 'staging host' },
      ],
    })
  );
  const errors = audit(fixture).errors;
  const has = (rule, file) =>
    errors.some((error) =>
      error.startsWith(`Public-safety (${rule}): ${file}`)
    );
  assert.ok(has('staging host', 'home.mdx:'));
  assert.ok(has('staging worker name', 'home.mdx:'));
  assert.ok(has('bypass secret name', 'home.mdx:'));
  assert.ok(has('workers.dev hostname', 'home.mdx:'));
  assert.ok(has('staging host', 'plugins/p/ref.md:'));
  assert.ok(has('staging host', 'docs-internal/runbook.mdx:'));
  assert.ok(!errors.some((error) => error.includes('): ok.mdx')));
  assert.ok(
    errors.some((error) => error.startsWith('Invalid allowlist entry'))
  );
});

test('inventory regeneration preserves audience metadata and collapsed tab navigation', () => {
  const root = path.resolve(__dirname, '..');
  const files = plannedFiles(root);
  assert.equal(files.has('../docs.json'), false);
  for (const [file, source] of files) {
    const current = fs.readFileSync(path.join(root, 'apps/docs', file), 'utf8');
    for (const key of ['updatedAt', 'audience']) {
      const pattern = new RegExp(`^${key}:.*$`, 'm');
      assert.match(source, pattern, file);
      assert.equal(source.match(pattern)[0], current.match(pattern)[0], file);
    }
  }
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/docs/docs.json'), 'utf8')
  );
  const reference = config.navigation.tabs.find(
    (tab) => tab.tab === 'Reference'
  );
  const inventory = reference.groups
    .flatMap((group) => group.pages)
    .find((group) => group?.group === 'Repository inventory');
  assert.equal(inventory.expanded, false);
  assert(inventory.pages.every((page) => typeof page === 'string'));
});
