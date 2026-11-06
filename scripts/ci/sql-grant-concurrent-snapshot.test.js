const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('concurrent CI snapshot evaluations never fetch or contend on shallow.lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-grant-snapshot-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'vhpx');
    git('config', 'user.email', 'contact@vohoangphuc.com');
    fs.mkdirSync(path.join(root, 'scripts/ci'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'scripts/ci/sql-grant-guard.baseline.json'),
      JSON.stringify({
        label: 'historical debt, not safe',
        source: '0'.repeat(40),
        files: {},
        entries: [],
      })
    );
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
    fs.writeFileSync(
      path.join(root, '.git/shallow'),
      `${git('rev-parse', 'HEAD')}\n`
    );
    fs.writeFileSync(path.join(root, '.git/shallow.lock'), 'held by fixture');
    git('remote', 'add', 'origin', path.join(root, 'unavailable-remote'));
    const helper = path.join(__dirname, 'sql-grant-repository-fixture.js');
    const code = `const result = require(${JSON.stringify(helper)}).checkSnapshot(${JSON.stringify(root)}); if (result.violations.length) throw new Error(JSON.stringify(result.violations));`;
    const run = (expected = 0) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', code], {
          env: { ...process.env, CI: 'true', GITHUB_BASE_REF: 'main' },
        });
        let stderr = '';
        child.stderr.on('data', (data) => {
          stderr += data;
        });
        child.on('error', reject);
        child.on('close', (status) => {
          try {
            assert.equal(status, expected, stderr);
            if (expected) assert.match(stderr, /function-acl/);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    await Promise.all([run(), run()]);
    const migrations = path.join(root, 'apps/database/supabase/migrations');
    fs.mkdirSync(migrations, { recursive: true });
    fs.writeFileSync(
      path.join(migrations, '20300101000000_unsafe.sql'),
      'create function public.unsafe() returns int language sql as $$select 1$$;'
    );
    await Promise.all([run(1), run(1)]);
    assert.equal(
      fs.readFileSync(path.join(root, '.git/shallow.lock'), 'utf8'),
      'held by fixture'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
