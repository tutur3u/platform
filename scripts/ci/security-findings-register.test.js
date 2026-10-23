const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  acceptanceWindowValid,
  applyAcceptances,
  buildRegister,
  fromBunAudit,
  fromCodeScanning,
  fromDependabot,
  fromGitleaks,
  stableId,
  summarize,
} = require('./security-findings-register.js');

const codeAlert = (number, level, state = 'open', extra = {}) => ({
  html_url: `https://github.com/o/r/security/code-scanning/${number}`,
  most_recent_instance: {
    location: { path: 'apps/database/x.sql', start_line: 9 },
  },
  number,
  rule: { id: 'js/sql-injection', security_severity_level: level },
  state,
  ...extra,
});

function sampleRegister() {
  const entries = [
    ...fromBunAudit({
      braces: [
        {
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
          vulnerable_versions: '<=3.0.3',
        },
      ],
    }),
    ...fromDependabot([
      {
        dependency: {
          manifest_path: 'a/package-lock.json',
          package: { name: 'toml' },
        },
        html_url: 'https://github.com/o/r/security/dependabot/1',
        security_advisory: { ghsa_id: 'GHSA-x', severity: 'critical' },
        state: 'fixed',
        fixed_at: '2026-10-22T00:00:00Z',
      },
    ]),
    ...fromCodeScanning([
      codeAlert(5, 'critical'),
      codeAlert(6, 'high', 'dismissed', {
        dismissed_at: '2026-10-21T00:00:00Z',
        dismissed_reason: 'false positive',
      }),
    ]),
    ...fromGitleaks([{ id: 'abc123', rule: 'generic-api-key' }]),
  ];
  return buildRegister({
    coverage: [
      { source: 'bun-audit', status: 'scanned' },
      { reason: 'HTTP 403', source: 'dependabot', status: 'unavailable' },
    ],
    entries,
    generatedAt: '2026-10-23T02:17:00Z',
    sha: 'f'.repeat(40),
  });
}

test('register entries carry stable IDs, owners, status and receipts', () => {
  const register = sampleRegister();
  assert.equal(register.format, 'tuturuuu-security-register/v1');
  for (const entry of register.entries) {
    assert.match(entry.id, /^TTR-SEC-[A-Z]+-[0-9a-f]{12}$/u);
    for (const field of [
      'severity',
      'owner',
      'source',
      'status',
      'remediation',
    ]) {
      assert.ok(field in entry, `${entry.id} lacks ${field}`);
    }
  }
  assert.equal(stableId('codeql', '5'), stableId('codeql', '5'));
  assert.notEqual(stableId('codeql', '5'), stableId('codeql', '6'));
  const fixed = register.entries.find((entry) => entry.source === 'dependabot');
  assert.equal(fixed.status, 'fixed');
  assert.deepEqual(fixed.remediation, [
    { at: '2026-10-22T00:00:00Z', kind: 'fixed' },
  ]);
  const accepted = register.entries.find(
    (entry) => entry.status === 'accepted'
  );
  assert.equal(accepted.remediation[0].reason, 'false positive');
  assert.equal(
    register.entries.find((entry) => entry.source === 'code-scanning').owner,
    'database'
  );
});

test('only confirmed open critical/high findings block releases', () => {
  const register = sampleRegister();
  const blockers = register.entries.filter((entry) =>
    register.blockers.includes(entry.id)
  );
  assert.deepEqual(
    blockers.map(({ source, severity }) => `${source}:${severity}`),
    ['bun-audit:high']
  );
  // Untriaged scanner output (CodeQL, gitleaks) stays visible but unconfirmed.
  for (const source of ['code-scanning', 'gitleaks']) {
    assert.ok(
      register.entries.some(
        (entry) => entry.source === source && !entry.confirmed
      )
    );
  }
});

test('the public register is redacted', () => {
  const text = JSON.stringify(sampleRegister());
  assert.doesNotMatch(
    text,
    /apps\/database\/x\.sql|js\/sql-injection|start_line/u
  );
  assert.doesNotMatch(text, /"(?:file|line|commit|Match|Secret)"/u);
});

test('summaries never claim a clearance and report coverage gaps', () => {
  const summary = summarize(sampleRegister());
  assert.match(summary, /Release blockers \(confirmed critical\/high\): 1/u);
  assert.match(summary, /dependabot: HTTP 403/u);
  assert.match(summary, /It is not\s+a clearance/u);
  const empty = summarize(
    buildRegister({ coverage: [], entries: [], generatedAt: 'now', sha: 'x' })
  );
  for (const text of [summary, empty]) {
    assert.doesNotMatch(
      text,
      /all clear|no vulnerabilities|is secure|clean bill/iu
    );
  }
});

test('risk acceptances apply only when approved and unexpired', () => {
  const nodeForge = fromBunAudit({
    'node-forge': [
      {
        id: 1,
        severity: 'high',
        title: 'synthetic',
        url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
        vulnerable_versions: '<=1.4.0',
      },
    ],
  });
  const now = Date.parse('2026-11-01T00:00:00Z');
  const base = {
    advisory: 'GHSA-86w9-cpqp-85rv',
    expiresAt: '2027-01-21',
    proposedAt: '2026-10-23',
  };
  const build = (acceptance) =>
    buildRegister({
      coverage: [],
      entries: applyAcceptances(nodeForge, [{ ...base, ...acceptance }], now),
      generatedAt: 'now',
      sha: 'a'.repeat(40),
    });

  // Pending (the shipped state): still open and still a release blocker.
  const pending = build({ status: 'pending', approvedBy: null });
  assert.equal(pending.entries[0].status, 'open');
  assert.equal(pending.entries[0].acceptance.status, 'pending');
  assert.equal(pending.blockers.length, 1);
  // A status flip without a recorded approver changes nothing.
  assert.equal(build({ status: 'accepted' }).blockers.length, 1);
  // Approved by the release authority and unexpired: accepted, not blocking.
  const accepted = build({
    approvedAt: '2026-10-30',
    approvedBy: 'release-authority',
    status: 'accepted',
  });
  assert.equal(accepted.entries[0].status, 'accepted');
  assert.equal(accepted.blockers.length, 0);
  assert.equal(accepted.entries[0].remediation.at(-1).kind, 'risk-accepted');
  // Expired: open and blocking again.
  const expired = build({
    approvedAt: '2026-10-30',
    approvedBy: 'release-authority',
    expiresAt: '2026-10-31',
    status: 'accepted',
  });
  assert.equal(expired.entries[0].acceptance.status, 'expired');
  assert.equal(expired.blockers.length, 1);

  // The 90-day window is enforced: an approved acceptance with a missing or
  // invalid proposedAt, an expiry past the cap or before the proposal never
  // accepts the finding.
  const approvedBy = {
    approvedAt: '2026-10-30',
    approvedBy: 'release-authority',
    status: 'accepted',
  };
  for (const window of [
    { proposedAt: undefined },
    { proposedAt: 'not-a-date' },
    { expiresAt: '2027-01-22' },
    { expiresAt: '2026-10-22' },
    { expiresAt: undefined },
  ]) {
    const invalid = build({ ...approvedBy, ...window });
    assert.equal(invalid.entries[0].status, 'open', JSON.stringify(window));
    assert.equal(invalid.entries[0].acceptance.status, 'invalid');
    assert.equal(invalid.blockers.length, 1);
  }
  // Exactly 90 days is allowed.
  assert.equal(build(approvedBy).entries[0].status, 'accepted');

  // A renewal appended after an expired or pending entry still applies; the
  // earlier non-live entry is only an annotation when nothing is in force.
  const lapsed = {
    ...base,
    ...approvedBy,
    expiresAt: '2026-10-31',
    proposedAt: '2026-08-02',
  };
  const renewal = {
    ...base,
    ...approvedBy,
    proposedAt: '2026-10-31',
    expiresAt: '2027-01-21',
  };
  for (const earlier of [lapsed, { ...base, status: 'pending' }]) {
    const renewed = buildRegister({
      coverage: [],
      entries: applyAcceptances(nodeForge, [earlier, renewal], now),
      generatedAt: 'now',
      sha: 'a'.repeat(40),
    });
    assert.equal(renewed.entries[0].status, 'accepted');
    assert.equal(renewed.blockers.length, 0);
  }
  const onlyLapsed = buildRegister({
    coverage: [],
    entries: applyAcceptances(nodeForge, [lapsed], now),
    generatedAt: 'now',
    sha: 'a'.repeat(40),
  });
  assert.equal(onlyLapsed.entries[0].acceptance.status, 'expired');
  assert.equal(onlyLapsed.blockers.length, 1);
});

test('every shipped risk acceptance is well formed and windowed', () => {
  // Risks are resolved rather than accepted where possible (node-forge was
  // removed instead of accepted), so the shipped list may be empty. Any entry
  // that is added must still carry a scope, guards, an owner and a valid
  // window of at most 90 days.
  const file = require('node:path').resolve(
    __dirname,
    '../../.github/security/risk-acceptances.json'
  );
  const parsed = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
  assert.equal(parsed.format, 'tuturuuu-risk-acceptances/v1');
  assert.ok(Array.isArray(parsed.acceptances));
  for (const item of parsed.acceptances) {
    assert.match(item.advisory, /^GHSA-[\w-]+$/u);
    assert.ok(item.scope && item.owner && Array.isArray(item.guards));
    assert.equal(acceptanceWindowValid(item), true, item.advisory);
    // An approval is recorded only together with its approver.
    assert.equal(
      item.status === 'accepted',
      typeof item.approvedBy === 'string' && item.approvedBy.length > 0,
      item.advisory
    );
  }
});
