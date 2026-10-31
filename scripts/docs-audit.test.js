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
    'Run it on `/Users/Someone/work/repo/`.',
    'ssh skr-example',
    'https://worker.account.workers.dev/health',
    'Connect to 192.168.1.20 or host.tailnet-name.ts.net',
    'Tailnet peer 100.101.102.103',
    `token ghp_${'a'.repeat(36)}`,
    `jwt eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(20)}.sig`,
    `https://${'a'.repeat(20)}.supabase.co`,
    'ref nzamlzqfdwaaxdefwraj',
    'thread mcp:launch:abc',
    'agent mcp:0123abcd-0000',
    'Easy\n  Center asked for this.',
    'The bacsivy clinic and PKTM sites.',
    'Mail owner@gmail.com or phucvo@example.test',
  ];
  const errors = publicSafetyErrors(unsafe.join('\n'), 'page.mdx');
  const labels = new Set(errors.map((error) => error.split(':')[0]));
  assert.ok(labels.size >= 13, [...labels].join('|'));
  assert.ok(errors.every((error) => error.startsWith('Public-safety (')));
  assert.ok(
    errors.every(
      (error) =>
        !/SR-123|Someone|skr-example|ghp_|eyJ|nzamlz|bacsivy|PKTM|gmail/.test(
          error
        )
    )
  );
  // Each new rule fires on its own line, and a wrapped name reports its start.
  for (const [index, line] of unsafe.entries()) {
    if (line.includes('\n')) continue;
    assert.ok(
      publicSafetyErrors(line, 'p.mdx').length >= 1,
      `rule for line ${index}`
    );
  }
  assert.ok(
    publicSafetyErrors('x\nEasy\n  Center', 'p.mdx').includes(
      'Public-safety (customer name without consent): p.mdx:2'
    )
  );
});

test('public-safety guard allows placeholders and public examples', () => {
  const safe = [
    'Use `<repo-root>/apps/docs` and `ssh <build-mac>`.',
    'https://<worker>.<account-subdomain>.workers.dev/health',
    'https://<staging-project-ref>.supabase.co',
    'The emulator reaches the host at 10.0.2.2; the Vietnamese memo says Thanh toan.',
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
    'Finding SR-123 on ssh skr-example\n'
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
    `${header}Use web.staging.tutur3u.com and tuturuuu-web-wave1-staging.\nSet VERCEL_AUTOMATION_BYPASS_SECRET and my.workers.dev.\n`
  );
  write(
    'apps/docs/ok.mdx',
    `${header}Placeholders <app>.staging.tutur3u.com and <sub>.workers.dev pass; AUTH_BYPASS is allowlisted.\n`
  );
  write('plugins/p/ref.md', 'Host calendar.staging.tutur3u.com\n');
  write('docs-internal/runbook.mdx', 'Host web.staging.tutur3u.com\n');
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
