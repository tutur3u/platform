const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  FORMAT,
  baselineKey,
  migrationVersions,
  postgresImage,
  validateManifest,
} = require('./supabase-baseline-key.js');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-baseline-key-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, body) => {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, body);
  };
  write('apps/database/supabase/config.toml', 'project_id = "test"');
  write(
    'apps/database/supabase/migrations/20260101000000_initial.sql',
    'select 1;'
  );
  const options = {
    root,
    cliVersion: '2.117.0',
    services: [{ name: 'supabase/postgres', local: '17.6.1.167' }],
    arch: 'x64',
    platform: 'linux',
  };
  return { root, write, options, key: () => baselineKey(options) };
}
for (const file of [
  'config.toml',
  'seed.sql',
  'seeds/sample.sql',
  'migrations/20260101000000_initial.sql',
  'migrations/20260102000000_next.sql',
]) {
  test(`baseline invalidates on ${file} changes`, (t) => {
    const f = fixture(t);
    const before = f.key();
    f.write(`apps/database/supabase/${file}`, 'changed');
    assert.notEqual(f.key(), before);
  });
}
for (const input of ['cliVersion', 'arch', 'platform', 'seedEpoch', 'image']) {
  test(`baseline invalidates on ${input}`, (t) => {
    const f = fixture(t);
    assert.notEqual(
      f.key(),
      baselineKey({ ...f.options, [input]: 'different' })
    );
  });
}
test('image versions invalidate but service ordering does not', (t) => {
  const f = fixture(t);
  const services = [
    ...f.options.services,
    { name: 'supabase/gotrue', local: 'v2' },
  ];
  assert.equal(
    baselineKey({ ...f.options, services }),
    baselineKey({ ...f.options, services: [...services].reverse() })
  );
  assert.notEqual(f.key(), baselineKey({ ...f.options, services }));
});
test('ignored environment files and test data do not enter fingerprint', (t) => {
  const f = fixture(t);
  const before = f.key();
  f.write('apps/database/.env', 'SECRET=do-not-cache');
  f.write('apps/database/supabase/.temp/project-ref', 'private');
  assert.equal(f.key(), before);
});
test('deleted migrations invalidate baseline', (t) => {
  const f = fixture(t);
  const before = f.key();
  fs.unlinkSync(
    path.join(
      f.root,
      'apps/database/supabase/migrations/20260101000000_initial.sql'
    )
  );
  assert.notEqual(f.key(), before);
});
test('migration history includes ordered SQL versions only', (t) => {
  const f = fixture(t);
  f.write('apps/database/supabase/migrations/README.md', 'docs');
  f.write(
    'apps/database/supabase/migrations/20260102000000_next.sql',
    'select 2;'
  );
  assert.deepEqual(migrationVersions(f.root), [
    '20260101000000',
    '20260102000000',
  ]);
});
test('mismatched or corrupted manifest is rejected', () => {
  const current = { key: 'exact', image: 'postgres:v1', checksum: 'sha256' };
  const manifest = { ...current, format: FORMAT };
  assert.equal(validateManifest(manifest, current), true);
  for (const key of ['key', 'image', 'checksum', 'format']) {
    assert.equal(
      validateManifest({ ...manifest, [key]: 'changed' }, current),
      false
    );
  }
  assert.equal(validateManifest(null, current), false);
});
test('baseline rejects symlinked inputs', (t) => {
  const f = fixture(t);
  fs.symlinkSync(
    '/outside',
    path.join(f.root, 'apps/database/supabase/seed.sql')
  );
  assert.throws(() => f.key(), /symlink/);
});

test('Postgres image follows the Supabase registry override', () => {
  const services = [{ name: 'supabase/postgres', local: '17.6.1.167' }];
  assert.equal(
    postgresImage(services),
    'public.ecr.aws/supabase/postgres:17.6.1.167'
  );
  assert.equal(
    postgresImage(services, 'ghcr.io'),
    'ghcr.io/supabase/postgres:17.6.1.167'
  );
  assert.throws(() => postgresImage(services, 'https://ghcr.io'), /Invalid/);
  assert.throws(() => postgresImage([]), /Missing/);
});
