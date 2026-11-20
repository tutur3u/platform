const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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
  definer,
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
    /must target a migration added by this change or prove a fix-forward: .*_moved\.sql/
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

function withRemediation(f, file = NEW) {
  const sql = fs.readFileSync(path.join(f.root, file), 'utf8');
  return {
    ...recordFor(f.root, OLD),
    remediationMigration: file,
    remediationDigest: createHash('sha256').update(sql).digest('hex'),
  };
}

const fixedDefiner = `CREATE OR REPLACE FUNCTION public.stale()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp AS $$ BEGIN RETURN; END; $$;
REVOKE ALL ON FUNCTION public.stale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale() TO service_role;
`;

test('attested historical finding binds the new hardened definition', async (t) => {
  const f = fixture(t, (root) => write(root, NEW, fixedDefiner));
  const record = withRemediation(f);
  assert.deepEqual(
    await admit(f, [record], {
      fetch: api({ [f.head]: [status([record])] }),
    }),
    []
  );
  await assert.rejects(
    admit(f, [record], {
      fetch: api({ [f.head]: [status([recordFor(f.root, OLD)])] }),
    }),
    /does not cover exactly/
  );
});

for (const [name, change] of [
  ['quoted PUBLIC role', (sql) => sql.replace('FROM PUBLIC', 'FROM "public"')],
  ['no replacement', (sql) => sql.replace('CREATE OR REPLACE', 'CREATE')],
  ['wrong routine', (sql) => sql.replaceAll('public.stale', 'public.other')],
  [
    'unsafe path',
    (sql) => sql.replace('pg_catalog, pg_temp', 'public, pg_temp'),
  ],
  [
    'missing authenticated revocation',
    (sql) => sql.replace(', authenticated', ''),
  ],
  ['client grant', (sql) => sql.replace('TO service_role', 'TO authenticated')],
  [
    'later alter',
    (sql) => sql + 'ALTER FUNCTION public.stale() RESET search_path;',
  ],
]) {
  test(`fix-forward rejects ${name}`, async (t) => {
    const f = fixture(t, (root) => write(root, NEW, change(fixedDefiner)));
    const record = withRemediation(f);
    const calls = [];
    await assert.rejects(
      admit(f, [record], { fetch: api({}, calls) }),
      /must target a migration added by this change or prove a fix-forward/
    );
    assert.deepEqual(calls, []);
  });
}

test('an altered historical migration cannot use fix-forward admission', async (t) => {
  const f = fixture(t, (root) => {
    write(root, NEW, fixedDefiner);
    fs.appendFileSync(
      path.join(root, OLD),
      '\n-- modified historical migration\n'
    );
  });
  const record = withRemediation(f);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /must target a migration added by this change or prove a fix-forward/
  );
});

test('the Meet erasure ACL migration proves both historical routine repairs', () => {
  const { verifyRemediation } = require('./security-definer-guard');
  const records = require('./security-definer-verified-findings.json');
  const migration = '20261120102500_meet_attendance_erasure_acl.sql';
  const sql = fs.readFileSync(
    path.join(__dirname, '../..', MIGRATIONS, migration),
    'utf8'
  );
  const migrationDirectory = path.join(__dirname, '../..', MIGRATIONS);
  const intervening = fs
    .readdirSync(migrationDirectory)
    .filter(
      (file) =>
        file.slice(0, 14) > '20261120095800' &&
        file.slice(0, 14) < migration.slice(0, 14)
    )
    .sort()
    .map((file) =>
      fs.readFileSync(path.join(migrationDirectory, file), 'utf8')
    );
  const repaired = records.filter(({ file }) =>
    file.endsWith('20261120095800_meet_attendance_erasure_hardening.sql')
  );
  assert.equal(repaired.length, 2);
  for (const record of repaired) {
    const original = fs.readFileSync(
      path.join(__dirname, '../..', record.file),
      'utf8'
    );
    assert.equal(
      verifyRemediation(sql, { original, entry: record, intervening }),
      true,
      record.signature
    );
  }
});

test('a sibling rename cannot credit the new routine that reuses the old name', async (t) => {
  const sibling = `${MIGRATIONS}/20260101500000_rename.sql`;
  const f = fixture(t, (root) => {
    write(root, sibling, 'ALTER FUNCTION public.stale() RENAME TO moved;');
    write(root, NEW, fixedDefiner);
  });
  const record = withRemediation(f);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /prove a fix-forward/
  );
});

test('a sibling rename can credit a replacement of the renamed routine', async (t) => {
  const f = fixture(t, (root) => {
    write(
      root,
      `${MIGRATIONS}/20260101500000_rename.sql`,
      'ALTER FUNCTION public.stale() RENAME TO moved;'
    );
    write(root, NEW, fixedDefiner.replaceAll('public.stale', 'public.moved'));
  });
  const record = withRemediation(f);
  assert.deepEqual(
    await admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    []
  );
});

test('a rolled-back sibling rename cannot move the routine proof', async (t) => {
  const f = fixture(t, (root) => {
    write(
      root,
      `${MIGRATIONS}/20260101500000_rename.sql`,
      'BEGIN; ALTER FUNCTION public.stale() RENAME TO moved; ROLLBACK;'
    );
    write(root, NEW, fixedDefiner.replaceAll('public.stale', 'public.moved'));
  });
  const record = withRemediation(f);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /prove a fix-forward/
  );
});

test('a renamed qualified input type cannot credit an overload using the reused type name', async (t) => {
  const f = fixture(
    t,
    (root) => {
      write(
        root,
        `${MIGRATIONS}/20260101500000_rename_type.sql`,
        "ALTER TYPE public.input RENAME TO old_input; CREATE TYPE public.input AS ENUM ('new');"
      );
      write(
        root,
        NEW,
        fixedDefiner.replaceAll('public.stale()', 'public.stale(public.input)')
      );
    },
    (root) =>
      write(
        root,
        OLD,
        "CREATE TYPE public.input AS ENUM ('old');\n" +
          definer('stale').replaceAll(
            'public.stale()',
            'public.stale(public.input)'
          )
      )
  );
  const record = withRemediation(f);
  assert.match(record.signature, /public \. input/);
  await assert.rejects(
    admit(f, [record], { fetch: api({ [f.head]: [status([record])] }) }),
    /prove a fix-forward/
  );
});

for (const [name, substitute] of [
  ['a quoted dotted name', '"public.stale"()'],
  ['a different input type', 'public.stale(integer)'],
]) {
  test(`fix-forward rejects ${name}`, async (t) => {
    const f = fixture(t, (root) =>
      write(root, NEW, fixedDefiner.replaceAll('public.stale()', substitute))
    );
    const record = withRemediation(f);
    await assert.rejects(
      admit(f, [record], { fetch: api({}) }),
      /prove a fix-forward/
    );
  });
}

for (const mode of ['delete', 'modify']) {
  test(`trusted fix-forward does not survive remediation ${mode}`, async (t) => {
    const f = fixture(t, (root) => write(root, NEW, fixedDefiner));
    const record = withRemediation(f);
    fs.writeFileSync(
      path.join(f.trusted, path.basename(f.ledger)),
      JSON.stringify([record])
    );
    assert.deepEqual(await admit(f, [record], { fetch: api({}) }), []);
    const remediation = path.join(f.root, NEW);
    if (mode === 'delete') {
      const { execFileSync } = require('node:child_process');
      execFileSync('git', ['rm', NEW], { cwd: f.root });
    } else {
      fs.appendFileSync(remediation, '\n-- the digested remediation changed\n');
    }
    const findings = await admit(f, [record], { fetch: api({}) });
    assert.deepEqual(
      findings.map(({ file }) => file),
      [OLD]
    );
  });
}

function fixtureWithRisk(t) {
  let legacy;
  const f = fixture(
    t,
    () => {},
    (root, ledger) => {
      write(root, NEW, fixedDefiner);
      const { execFileSync } = require('node:child_process');
      execFileSync('git', ['add', '-A'], { cwd: root });
      legacy = recordFor(root, OLD);
      fs.writeFileSync(ledger, JSON.stringify([legacy]));
      write(
        root,
        '.github/security/risk-acceptances.json',
        JSON.stringify({
          format: 'tuturuuu-risk-acceptances/v1',
          acceptances: [
            {
              kind: 'definer-records',
              scope: {
                ledger: 'scripts/ci/security-definer-verified-findings.json',
                records: [legacy],
              },
              remediatedBy: NEW,
              remediationDigest: createHash('sha256')
                .update(fixedDefiner)
                .digest('hex'),
              proposedAt: '2026-11-20T05:10:41Z',
              approvedAt: '2026-11-20T05:10:41Z',
              approvedBy: 'fixture release authority',
              status: 'accepted',
              expiresAt: '2026-11-27T16:59:00Z',
            },
          ],
        })
      );
    },
    true
  );
  return { f, legacy };
}

test('scoped definer risk expires at its exact deadline and accepts only a verified upgrade', async (t) => {
  const { f, legacy } = fixtureWithRisk(t);
  const now = Date.parse('2026-11-27T16:59:00Z');
  assert.deepEqual(
    await admit(f, [legacy], { fetch: api({}), now: now - 1 }),
    []
  );
  assert.deepEqual(
    (await admit(f, [legacy], { fetch: api({}), now })).map(({ file }) => file),
    [OLD]
  );
  const replacement = withRemediation(f);
  const { attestationDescription } = require('./security-definer-admission');
  const trustedStatus = {
    ...status([]),
    description: attestationDescription(
      [],
      [{ from: legacy, to: replacement }]
    ),
  };
  await assert.rejects(
    admit(f, [replacement], { fetch: api({}), now }),
    /Missing security/
  );
  assert.deepEqual(
    await admit(f, [replacement], {
      fetch: api({ [f.head]: [trustedStatus] }),
      now,
    }),
    []
  );
});

test('a candidate cannot remove the trusted risk row before its records are attested', async (t) => {
  const { f, legacy } = fixtureWithRisk(t);
  fs.unlinkSync(path.join(f.root, '.github/security/risk-acceptances.json'));
  await assert.rejects(
    admit(f, [legacy], {
      fetch: api({}),
      now: Date.parse('2026-11-21T00:00:00Z'),
    }),
    /risk acceptance changed before its records were attested/
  );
});
