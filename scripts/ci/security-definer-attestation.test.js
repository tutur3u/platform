const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ATTESTER,
  attestationDescription,
  canonicalJson,
  recordsDigest,
} = require('./security-definer-admission');
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

// D3 attestation: exact head SHA, pinned creator, digest of exactly the new
// records, and fail-closed API handling, including through the guard CLI.
test('attestation missing, foreign, failed, wrong SHA or wrong hash fails closed', async (t) => {
  const f = fixture(t);
  const record = recordFor(f.root, NEW);
  const other = 'f'.repeat(40);
  for (const [statuses, error] of [
    [{}, /Missing security\/definer-record-admission status/],
    [
      { [other]: [status([record])] },
      /Missing security\/definer-record-admission/,
    ],
    [
      {
        [f.head]: [status([record], { creator: { login: 'someone', id: 1 } })],
      },
      /not a success from tuturuuu-release-bot/,
    ],
    [
      {
        [f.head]: [
          status([record], { creator: { login: ATTESTER.login, id: 1 } }),
        ],
      },
      /not a success/,
    ],
    [
      {
        [f.head]: [
          status([record], { creator: { login: 'impostor', id: ATTESTER.id } }),
        ],
      },
      /not a success/,
    ],
    [{ [f.head]: [status([record], { state: 'pending' })] }, /not a success/],
    [
      { [f.head]: [status([{ ...record, reason: 'other' }])] },
      /does not cover exactly the new records/,
    ],
    // The newest status wins: a later foreign status voids an earlier good one.
    [
      {
        [f.head]: [
          status([record], { creator: { login: 'someone', id: 2 } }),
          status([record]),
        ],
      },
      /not a success/,
    ],
  ]) {
    await assert.rejects(admit(f, [record], { fetch: api(statuses) }), error);
  }
});

test('an extra record not covered by the attested hash fails closed', async (t) => {
  const f = fixture(t, (root) => {
    write(root, NEW, definer('fresh'));
    write(root, `${MIGRATIONS}/20260104000000_extra.sql`, definer('extra'));
  });
  const record = recordFor(f.root, NEW);
  const extra = recordFor(f.root, `${MIGRATIONS}/20260104000000_extra.sql`);
  await assert.rejects(
    admit(f, [record, extra], { fetch: api({ [f.head]: [status([record])] }) }),
    /does not cover exactly the new records/
  );
  // The digest is order independent, so the full set is admissible.
  const findings = await admit(f, [extra, record], {
    fetch: api({ [f.head]: [status([record, extra])] }),
  });
  assert.deepEqual(
    findings.map((entry) => entry.file),
    [OLD]
  );
});

test('API failure, missing token and a substituted head SHA fail closed', async (t) => {
  const f = fixture(t);
  const record = recordFor(f.root, NEW);
  const good = api({ [f.head]: [status([record])] });
  for (const [options, error] of [
    [
      {
        fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }),
      },
      /lookup failed: HTTP 502/,
    ],
    [
      {
        fetch: async () => {
          throw new Error('network down');
        },
      },
      /lookup failed: network down/,
    ],
    [
      {
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ message: 'x' }),
        }),
      },
      /no status list/,
    ],
    [{ fetch: good, env: { GITHUB_TOKEN: '' } }, /needs GITHUB_TOKEN/],
    [
      { fetch: good, env: { HEAD_SHA: f.base } },
      /not the checked-out pull request head/,
    ],
    [
      { fetch: good, env: { BASE_SHA: 'main' } },
      /need full BASE_SHA and HEAD_SHA/,
    ],
  ]) {
    await assert.rejects(admit(f, [record], options), error);
  }
});

test('canonical digest sorts keys and records and is the pinned description', () => {
  const a = { b: 1, a: [2, { d: 1, c: 2 }] };
  assert.equal(canonicalJson(a), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.equal(
    recordsDigest([a, { z: 1 }]),
    recordsDigest([{ z: 1 }, { a: a.a, b: 1 }])
  );
  assert.notEqual(recordsDigest([a]), recordsDigest([a, { z: 1 }]));
  assert.match(
    attestationDescription([a]),
    /^definer-records sha256:[0-9a-f]{64}$/
  );
  assert.deepEqual(ATTESTER, { login: 'tuturuuu-release-bot', id: 348951514 });
});

test('trusted guard CLI fails closed on additions without an attestation token', (t) => {
  const f = fixture(t);
  const guardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-guard-'));
  t.after(() => fs.rmSync(guardDir, { recursive: true, force: true }));
  for (const name of fs.readdirSync(__dirname))
    if (/\.(js|json)$/.test(name) && !name.endsWith('.test.js'))
      fs.copyFileSync(path.join(__dirname, name), path.join(guardDir, name));
  fs.writeFileSync(
    path.join(guardDir, 'security-definer-verified-findings.json'),
    '[]'
  );
  for (const name of ['historical-blocks', 'reviewed-blocks'])
    write(f.root, `scripts/ci/security-definer-${name}.json`, '[]');
  fs.writeFileSync(
    path.join(guardDir, 'security-definer-historical-blocks.json'),
    '[]'
  );
  fs.writeFileSync(
    path.join(guardDir, 'security-definer-reviewed-blocks.json'),
    '[]'
  );
  fs.writeFileSync(f.ledger, JSON.stringify([recordFor(f.root, NEW)]));
  const result = spawnSync(
    process.execPath,
    [path.join(guardDir, 'security-definer-guard.js')],
    {
      cwd: f.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_SHA: f.base,
        HEAD_SHA: f.head,
        GITHUB_TOKEN: '',
      },
    }
  );
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /needs GITHUB_TOKEN/);
});
