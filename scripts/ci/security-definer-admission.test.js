const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { splitVerifiedRecords } = require('./security-definer-admission');
const {
  MIGRATIONS,
  NEW,
  OLD,
  admit,
  api,
  fixture,
  recordFor,
  status,
  write,
} = require('./security-definer-admission-fixture');

// D1 append-only base records and D2 source binding. Attestation, API and
// hash cases live in security-definer-attestation.test.js.
test('positive: attested record for an added migration admits only its finding', async (t) => {
  const f = fixture(t);
  const record = recordFor(f.root, NEW);
  const calls = [];
  const findings = await admit(f, [record], {
    fetch: api({ [f.head]: [status([record])] }, calls),
  });
  assert.deepEqual(
    findings.map((entry) => entry.file),
    [OLD],
    'the unrelated pre-existing finding stays enforced'
  );
  assert.equal(calls.length, 1);
  assert.match(
    calls[0].url,
    new RegExp(`repos/tutur3u/platform/commits/${f.head}/statuses`)
  );
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture');
});

test('no additions: no API call and base ledger behavior is unchanged', async (t) => {
  const f = fixture(t);
  const calls = [];
  const findings = await admit(f, [], {
    fetch: api({}, calls),
    env: { GITHUB_TOKEN: '' },
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(findings.map((entry) => entry.file).sort(), [OLD, NEW]);
});

test('base records are append-only: an edit or removal fails before scanning', () => {
  const base = [
    { file: 'a.sql', line: 1, reason: 'x' },
    { file: 'b.sql', line: 2, reason: 'y' },
  ];
  assert.throws(
    () => splitVerifiedRecords(base, [base[0], { ...base[1], line: 3 }]),
    /changed or removed \(base records are append-only\): b\.sql/
  );
  assert.throws(
    () => splitVerifiedRecords(base, [base[1]]),
    /changed or removed.*a\.sql/
  );
  // Key reordering is not byte-identical either.
  assert.throws(
    () =>
      splitVerifiedRecords(base, [
        { line: 1, file: 'a.sql', reason: 'x' },
        base[1],
      ]),
    /changed or removed/
  );
  assert.throws(
    () =>
      splitVerifiedRecords(base, [
        ...base,
        { file: 'c.sql' },
        { file: 'c.sql' },
      ]),
    /Duplicate/
  );
  assert.deepEqual(
    splitVerifiedRecords(base, [base[1], { file: 'c.sql' }, base[0]]),
    [{ file: 'c.sql' }]
  );
});

test('a record for a pre-existing migration is rejected even when attested', async (t) => {
  const f = fixture(t);
  const record = recordFor(f.root, OLD);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /must target a migration added by this change/
  );
});

test('a record for a modified migration is rejected', async (t) => {
  const f = fixture(t, (root) =>
    fs.appendFileSync(path.join(root, OLD), '-- edited\n')
  );
  const record = recordFor(f.root, OLD);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /must target a migration added by this change/
  );
});

test('a record for a renamed migration is rejected', async (t) => {
  const moved = `${MIGRATIONS}/20260103000000_moved.sql`;
  const f = fixture(t, (root) => {
    write(root, moved, fs.readFileSync(path.join(root, OLD), 'utf8'));
    fs.rmSync(path.join(root, OLD));
  });
  const record = recordFor(f.root, moved);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /must target a migration added by this change: .*_moved\.sql/
  );
});

for (const [field, value] of [
  ['digest', '0'.repeat(64)],
  ['sourceDigest', '1'.repeat(64)],
  ['line', 99],
  ['rule', 'public-execute'],
  ['signature', 'public.other()'],
  ['classification', 'historical debt, not safe'],
  ['reason', ' '],
]) {
  test(`a ${field} mismatch matches no recomputed finding`, async (t) => {
    const f = fixture(t);
    const record = { ...recordFor(f.root, NEW), [field]: value };
    await assert.rejects(
      admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
      /matches no recomputed finding/
    );
  });
}

test('a record for an added migration without any finding is rejected', async (t) => {
  const f = fixture(t, (root) => write(root, NEW, 'SELECT 1;\n'));
  const sourceDigest = require('node:crypto')
    .createHash('sha256')
    .update('SELECT 1;\n')
    .digest('hex');
  const record = {
    file: NEW,
    line: 1,
    sourceDigest,
    rule: 'missing-search-path',
    signature: 'public.fresh()',
    digest: '2'.repeat(64),
    classification: 'verified false positive',
    reason: 'No finding exists.',
  };
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /matches no recomputed finding/
  );
});
