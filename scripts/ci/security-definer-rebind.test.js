// Attested rebinds: a base verified record may move to new migration bytes
// only by changing its sourceDigest, for a migration this change modified,
// under one release-bot attestation that also covers any additions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  admitVerifiedFindings,
  attestationDescription,
  recordsDigest,
  splitLedger,
} = require('./security-definer-admission');
const {
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
const { checkRepository } = require('./security-definer-guard');

// Base ledger trusts OLD's finding; the head edits OLD outside the definer.
function rebindFixture(t, edit = (root) => appendComment(root)) {
  let from;
  const f = fixture(t, (root) => {
    from = recordFor(root, OLD);
    edit(root);
  });
  fs.writeFileSync(
    path.join(f.trusted, 'security-definer-verified-findings.json'),
    JSON.stringify([from])
  );
  return { ...f, from };
}

function appendComment(root) {
  fs.appendFileSync(path.join(root, OLD), '-- bounded by the sync wrapper\n');
}

const rebindStatus = (additions, rebinds, overrides) =>
  status(additions, {
    description: attestationDescription(additions, rebinds),
    ...overrides,
  });

test('positive: an attested sourceDigest-only rebind suppresses the modified finding', async (t) => {
  const f = rebindFixture(t);
  const to = recordFor(f.root, OLD);
  assert.notEqual(to.sourceDigest, f.from.sourceDigest);
  assert.equal(to.digest, f.from.digest, 'the finding itself is unchanged');
  const findings = await admit(f, [to], {
    fetch: api({ [f.head]: [rebindStatus([], [{ from: f.from, to }])] }),
  });
  assert.deepEqual(findings, []);
});

test('the rebound record is fed to the trusted scan, not filtered afterwards', async (t) => {
  const f = rebindFixture(t);
  const to = recordFor(f.root, OLD);
  fs.writeFileSync(f.ledger, JSON.stringify([to]));
  const seen = [];
  await admitVerifiedFindings({
    root: f.root,
    trustedDirectory: f.trusted,
    scan: (verifiedFindings) => {
      seen.push(verifiedFindings);
      return checkRepository({
        root: f.root,
        baseline: [],
        reviewedBlocks: [],
        historicalBlocks: [],
        verifiedFindings,
      });
    },
    env: { BASE_SHA: f.base, HEAD_SHA: f.head, GITHUB_TOKEN: 'fixture' },
    fetch: api({ [f.head]: [rebindStatus([], [{ from: f.from, to }])] }),
  });
  assert.deepEqual(seen.at(0), [f.from], 'binding scans with base records');
  assert.deepEqual(seen.at(-1), [to], 'the final scan trusts the rebind');
});

test('rebinds and additions share one attestation over both lists', async (t) => {
  const f = rebindFixture(t, (root) => {
    appendComment(root);
    write(root, NEW, definer('fresh'));
  });
  const to = recordFor(f.root, OLD);
  const added = recordFor(f.root, NEW);
  const rebinds = [{ from: f.from, to }];
  assert.deepEqual(
    await admit(f, [to, added], {
      fetch: api({ [f.head]: [rebindStatus([added], rebinds)] }),
    }),
    []
  );
  // An additions-only attestation does not cover the rebind.
  await assert.rejects(
    admit(f, [to, added], { fetch: api({ [f.head]: [status([added])] }) }),
    /does not cover exactly the new records/
  );
});

test('a rebind without an attestation is rejected', async (t) => {
  const f = rebindFixture(t);
  const to = recordFor(f.root, OLD);
  await assert.rejects(
    admit(f, [to], { fetch: api({}) }),
    /Missing security\/definer-record-admission status/
  );
});

test('changing any field other than sourceDigest is still append-only', async (t) => {
  const f = rebindFixture(t);
  const to = recordFor(f.root, OLD);
  for (const edit of [
    { reason: 'Rewritten reason.' },
    { line: to.line + 1 },
    { digest: '0'.repeat(64) },
  ]) {
    const record = { ...to, ...edit };
    await assert.rejects(
      admit(f, [record], {
        fetch: api({
          [f.head]: [rebindStatus([], [{ from: f.from, to: record }])],
        }),
      }),
      /changed or removed \(base records are append-only\)/
    );
  }
  assert.throws(
    () => splitLedger([f.from], []),
    /changed or removed \(base records are append-only\)/
  );
});

test('a rebind for a migration this change did not modify is rejected', async (t) => {
  const f = rebindFixture(t, (root) => write(root, NEW, definer('fresh')));
  const to = { ...f.from, sourceDigest: 'f'.repeat(64) };
  await assert.rejects(
    admit(f, [to], {
      fetch: api({ [f.head]: [rebindStatus([], [{ from: f.from, to }])] }),
    }),
    /rebind must target a migration modified by this change/
  );
});

test('a rebind that does not match the head bytes is rejected', async (t) => {
  const f = rebindFixture(t);
  const to = { ...f.from, sourceDigest: 'f'.repeat(64) };
  await assert.rejects(
    admit(f, [to], {
      fetch: api({ [f.head]: [rebindStatus([], [{ from: f.from, to }])] }),
    }),
    /rebind matches no recomputed finding/
  );
});

test('additions-only attestations keep their original description', () => {
  const records = [{ file: 'a.sql', line: 1 }];
  assert.equal(
    attestationDescription(records),
    `definer-records sha256:${recordsDigest(records)}`
  );
  assert.equal(
    attestationDescription(records, []),
    attestationDescription(records)
  );
  assert.match(
    attestationDescription([], [{ from: records[0], to: records[0] }]),
    /^definer-rebinds sha256:[0-9a-f]{64}$/
  );
});
