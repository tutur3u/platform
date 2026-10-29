const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  assertShrinkingBlocks,
  assertReviewedBlocks,
} = require('./security-definer-blocks');
const { checkRepository } = require('./security-definer-guard');
const historical = require('./security-definer-historical-blocks.json');
const reviewed = require('./security-definer-reviewed-blocks.json');

test('historical baseline rejects a new path or block', () => {
  assert.throws(
    () =>
      assertShrinkingBlocks(historical, [
        ...historical,
        { ...historical[0], file: 'new.sql' },
      ]),
    /only shrink/
  );
});
test('historical baseline rejects changed digests', () => {
  assert.throws(
    () =>
      assertShrinkingBlocks(historical, [
        { ...historical[0], blockDigest: '0'.repeat(64) },
        ...historical.slice(1),
      ]),
    /only shrink/
  );
});
test('historical baseline accepts deletion and rejects duplicate entries', () => {
  assert.doesNotThrow(() =>
    assertShrinkingBlocks(historical, historical.slice(1))
  );
  assert.throws(
    () => assertShrinkingBlocks(historical, [historical[0], historical[0]]),
    /only shrink/
  );
});
test('historical acceptance binds path and raw block digest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-block-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = 'old.sql';
  const sql = 'DO $$ BEGIN EXECUTE command; END $$;';
  fs.writeFileSync(path.join(root, file), sql);
  const run = (historicalBlocks) =>
    checkRepository({
      root,
      files: [file],
      baseline: [],
      reviewedBlocks: [],
      historicalBlocks,
    });
  const [finding] = run([]);
  const entry = { file, blockDigest: finding.blockDigest };
  assert.deepEqual(run([entry]), []);
  assert.equal(run([{ ...entry, file: 'other.sql' }]).length, 1);
  assert.equal(run([]).length, 1);
  fs.appendFileSync(path.join(root, file), '\n');
  assert.deepEqual(run([entry]), []);
  fs.writeFileSync(
    path.join(root, file),
    sql.replace('command', 'other_command')
  );
  assert.equal(run([entry]).length, 1);
});

const file =
  'apps/database/supabase/migrations/20261029030410_restrict_nonpublic_definers.sql';
for (const record of reviewed.filter(
  (entry) => entry.file === file && entry.grantedRoles
)) {
  test(
    'mixed hardening block binds source and roles: ' + record.grantedRoles,
    (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-block-'));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      const sql = fs.readFileSync(
        path.resolve(__dirname, '../..', file),
        'utf8'
      );
      fs.writeFileSync(path.join(root, file), sql);
      const run = (records = reviewed) =>
        checkRepository({
          root,
          files: [file],
          baseline: [],
          reviewedBlocks: records,
          historicalBlocks: [],
        });
      assert.deepEqual(run(), []);
      for (const changed of [
        { ...record, grantedRoles: [] },
        { ...record, grantedRoles: ['anon'] },
        { ...record, grantedRoles: [...record.grantedRoles, 'PUBLIC'] },
        { ...record, file: 'copied.sql' },
        { ...record, blockDigest: '0'.repeat(64) },
      ]) {
        assert.equal(
          run(reviewed.map((entry) => (entry === record ? changed : entry)))
            .length,
          1
        );
      }
      const tag = record.grantedRoles.length === 1 ? 'definers' : 'legacy';
      fs.writeFileSync(
        path.join(root, file),
        sql.replace('DO $' + tag + '$', 'DO /* changed */ $' + tag + '$')
      );
      assert.equal(run().length, 1);
      fs.writeFileSync(
        path.join(root, file),
        sql.replaceAll('TO service_role', 'TO anon')
      );
      assert.equal(run().length, 2);
    }
  );
}

test('trusted reviews reject changed roles even with an unchanged block digest', () => {
  const record = reviewed.find((entry) => entry.grantedRoles);
  assert.throws(
    () =>
      assertReviewedBlocks(reviewed, [{ ...record, grantedRoles: ['anon'] }]),
    /grant roles changed/
  );
});

test('trusted CI guard rejects inventory expansion and digest edits, permits shrink', (t) => {
  const { execFileSync, spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-blocks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const trusted = path.join(root, 'trusted');
  const candidate = path.join(root, 'candidate');
  fs.mkdirSync(trusted);
  fs.mkdirSync(path.join(candidate, 'scripts/ci'), { recursive: true });
  execFileSync('git', ['init', '-q', candidate]);
  const copied = new Set();
  function copy(name) {
    if (copied.has(name)) return;
    copied.add(name);
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    fs.writeFileSync(path.join(trusted, name), source);
    for (const match of source.matchAll(/require\('\.\/([^']+)'\)/g))
      copy(match[1].endsWith('.json') ? match[1] : match[1] + '.js');
  }
  copy('security-definer-guard.js');
  fs.copyFileSync(
    path.join(__dirname, 'security-definer-baseline.json'),
    path.join(trusted, 'security-definer-baseline.json')
  );
  const historicalFile = path.join(
    candidate,
    'scripts/ci/security-definer-historical-blocks.json'
  );
  const reviewFile = path.join(
    candidate,
    'scripts/ci/security-definer-reviewed-blocks.json'
  );
  fs.writeFileSync(reviewFile, JSON.stringify(reviewed));
  fs.copyFileSync(
    path.join(__dirname, 'security-definer-verified-findings.json'),
    path.join(candidate, 'scripts/ci/security-definer-verified-findings.json')
  );
  const run = (entries) => {
    fs.writeFileSync(historicalFile, JSON.stringify(entries));
    return spawnSync(
      process.execPath,
      [path.join(trusted, 'security-definer-guard.js')],
      {
        cwd: candidate,
        encoding: 'utf8',
      }
    );
  };
  for (const entries of [
    [...historical, { ...historical[0], file: 'new.sql' }],
    [{ ...historical[0], blockDigest: '0'.repeat(64) }, ...historical.slice(1)],
  ]) {
    const result = run(entries);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /may only shrink/);
  }
  const removed = run(historical.slice(1));
  assert.equal(removed.status, 0, removed.stderr);
  fs.writeFileSync(
    reviewFile,
    JSON.stringify(
      reviewed.map((entry) =>
        entry.grantedRoles ? { ...entry, grantedRoles: ['anon'] } : entry
      )
    )
  );
  const changedRoles = run(historical);
  assert.equal(changedRoles.status, 1);
  assert.match(changedRoles.stderr, /grant roles changed/);
  fs.writeFileSync(reviewFile, JSON.stringify(reviewed));
  const verified = require('./security-definer-verified-findings.json');
  fs.writeFileSync(
    path.join(candidate, 'scripts/ci/security-definer-verified-findings.json'),
    JSON.stringify(
      verified.map((entry) => ({ ...entry, effectiveRoles: ['anon'] }))
    )
  );
  const changedEffectiveRoles = run(historical);
  assert.equal(changedEffectiveRoles.status, 1);
  assert.match(changedEffectiveRoles.stderr, /grant roles changed/);
});

test('historical inventory is explicitly debt and cannot be relabeled safe', () => {
  assert.ok(
    historical.every(
      (entry) => entry.classification === 'historical debt, not safe'
    )
  );
  assert.throws(
    () =>
      assertShrinkingBlocks(historical, [
        { ...historical[0], classification: 'safe' },
      ]),
    /only shrink/
  );
});
