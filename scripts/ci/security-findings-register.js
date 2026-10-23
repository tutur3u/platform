#!/usr/bin/env node
// Builds the daily security findings register from scanner output and GitHub
// alert APIs. Public Actions logs and artifacts are readable by anyone, so the
// register keeps only stable IDs, severity, owner role, source, status and
// remediation receipts. Code-scanning and secret locations stay in GitHub's
// maintainer-only security views and are referenced by alert URL only.
//
// Confirmed critical/high findings (advisory matches on locked versions) are
// release blockers and make the run fail. Scanner heuristics stay unconfirmed
// until a maintainer triages them; a source that could not be read is reported
// as a coverage gap, never as clean.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { ownerForPath } = require('./security-paths.js');
const { auditAdvisories } = require('./security-scan-diff.js');

const { env } = process;

const severities = ['critical', 'high', 'medium', 'low', 'unknown'];
const blocking = new Set(['critical', 'high']);

function stableId(source, key) {
  const digest = crypto
    .createHash('sha256')
    .update(`${source}|${key}`)
    .digest('hex')
    .slice(0, 12);
  return `TTR-SEC-${source.toUpperCase()}-${digest}`;
}

function severityOf(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'moderate') return 'medium';
  if (normalized === 'error') return 'high';
  if (normalized === 'warning') return 'medium';
  if (normalized === 'note') return 'low';
  return severities.includes(normalized) ? normalized : 'unknown';
}

function receiptsFor(alert) {
  const receipts = [];
  if (alert.fixed_at) receipts.push({ at: alert.fixed_at, kind: 'fixed' });
  if (alert.dismissed_at) {
    receipts.push({
      at: alert.dismissed_at,
      kind: 'dismissed',
      reason: alert.dismissed_reason ?? 'unspecified',
    });
  }
  return receipts;
}

function statusOf(state) {
  if (state === 'fixed' || state === 'auto_dismissed') return 'fixed';
  if (state === 'dismissed') return 'accepted';
  return 'open';
}

function fromBunAudit(report) {
  return auditAdvisories(report).map((item) => ({
    confirmed: true,
    detail: `${item.package} ${item.vulnerableVersions} (${item.advisory})`,
    id: stableId('bun', item.key),
    owner: 'dependencies',
    reference: `https://github.com/advisories/${item.advisory}`,
    remediation: [],
    severity: severityOf(item.severity),
    source: 'bun-audit',
    status: 'open',
  }));
}

function fromDependabot(alerts) {
  return alerts.map((alert) => {
    const ghsa = alert.security_advisory?.ghsa_id ?? 'unknown';
    const pkg = alert.dependency?.package?.name ?? 'unknown';
    const manifest = alert.dependency?.manifest_path ?? '';
    return {
      confirmed: true,
      detail: `${pkg} in ${manifest} (${ghsa})`,
      id: stableId('dependabot', `${ghsa}|${pkg}|${manifest}`),
      owner: 'dependencies',
      reference: alert.html_url,
      remediation: receiptsFor(alert),
      severity: severityOf(alert.security_advisory?.severity),
      source: 'dependabot',
      status: statusOf(alert.state),
    };
  });
}

// Rule IDs and paths of unfixed code alerts would map open weaknesses for
// attackers, so only the maintainer-only alert URL is published.
function fromCodeScanning(alerts) {
  return alerts.map((alert) => ({
    confirmed: false,
    detail: 'details withheld; see the alert',
    id: stableId('codeql', String(alert.number)),
    owner: ownerForPath(alert.most_recent_instance?.location?.path ?? ''),
    reference: alert.html_url,
    remediation: receiptsFor(alert),
    severity: severityOf(
      alert.rule?.security_severity_level ?? alert.rule?.severity
    ),
    source: 'code-scanning',
    status: statusOf(alert.state),
  }));
}

function fromGitleaks(findings) {
  return findings.map((finding) => ({
    confirmed: false,
    detail: `possible secret (${finding.rule}); location withheld`,
    id: stableId('secret', finding.id),
    owner: 'security-integration-owner',
    reference: 'security-checks.yaml run log (counts only)',
    remediation: [],
    severity: 'high',
    source: 'gitleaks',
    status: 'open',
  }));
}

// Risk acceptances (.github/security/risk-acceptances.json) are reviewed in
// pull requests. One changes a finding's status only when the release
// authority recorded approvedBy/approvedAt and it has not expired; a pending
// or expired acceptance is annotated but leaves the finding open (and a
// confirmed critical/high finding still blocks).
function applyAcceptances(entries, acceptances, now = Date.now()) {
  return entries.map((entry) => {
    const match = acceptances.find(
      (item) =>
        typeof item?.advisory === 'string' &&
        item.advisory.length > 0 &&
        ['bun-audit', 'dependabot'].includes(entry.source) &&
        `${entry.detail} ${entry.reference}`.includes(item.advisory)
    );
    if (!match) return entry;
    const expires = Date.parse(match.expiresAt ?? '');
    const approved =
      match.status === 'accepted' &&
      typeof match.approvedBy === 'string' &&
      match.approvedBy.length > 0 &&
      Number.isFinite(Date.parse(match.approvedAt ?? ''));
    const live = Number.isFinite(expires) && now < expires;
    const acceptance = {
      advisory: match.advisory,
      expiresAt: match.expiresAt ?? null,
      status: approved ? (live ? 'accepted' : 'expired') : 'pending',
    };
    if (!(approved && live)) return { ...entry, acceptance };
    return {
      ...entry,
      acceptance,
      remediation: [
        ...entry.remediation,
        {
          at: match.approvedAt,
          by: match.approvedBy,
          expiresAt: match.expiresAt,
          kind: 'risk-accepted',
        },
      ],
      status: 'accepted',
    };
  });
}

function readAcceptances(file, coverage) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed?.acceptances)) throw new Error('bad format');
    coverage.push({ source: 'risk-acceptances', status: 'scanned' });
    return parsed.acceptances;
  } catch (error) {
    // An unreadable list accepts nothing; it never hides a finding.
    coverage.push({
      reason: error.message,
      source: 'risk-acceptances',
      status: 'unavailable',
    });
    return [];
  }
}

function buildRegister({ coverage, entries, generatedAt, sha }) {
  const sorted = [...entries].sort(
    (a, b) =>
      severities.indexOf(a.severity) - severities.indexOf(b.severity) ||
      a.id.localeCompare(b.id)
  );
  const blockers = sorted.filter(
    (entry) =>
      entry.confirmed && entry.status === 'open' && blocking.has(entry.severity)
  );
  return {
    blockers: blockers.map(({ id }) => id),
    coverage,
    entries: sorted,
    format: 'tuturuuu-security-register/v1',
    generatedAt,
    sha,
  };
}

function summarize(register) {
  const open = register.entries.filter((entry) => entry.status === 'open');
  const sources = [...new Set(register.entries.map((entry) => entry.source))];
  const lines = [
    '## Security findings register',
    '',
    `Commit \`${register.sha}\` at ${register.generatedAt}.`,
    '',
    '| Source | Critical | High | Medium | Low | Unknown |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const source of sources.sort()) {
    const counts = severities.map(
      (severity) =>
        open.filter((e) => e.source === source && e.severity === severity)
          .length
    );
    lines.push(`| ${source} | ${counts.join(' | ')} |`);
  }
  lines.push(
    '',
    `Release blockers (confirmed critical/high): ${register.blockers.length}`
  );
  for (const entry of register.entries.filter((e) =>
    register.blockers.includes(e.id)
  )) {
    lines.push(
      `- \`${entry.id}\` ${entry.severity} ${entry.source} (owner: ${entry.owner})`
    );
  }
  const gaps = register.coverage.filter((item) => item.status !== 'scanned');
  if (gaps.length > 0) {
    lines.push('', 'Coverage gaps (not scanned, not clean):');
    for (const gap of gaps) lines.push(`- ${gap.source}: ${gap.reason}`);
  }
  lines.push(
    '',
    'This register is evidence for the listed sources at this commit. It is not',
    'a clearance: a source without findings has not been shown to be free of',
    'vulnerabilities, and unconfirmed findings still need triage.'
  );
  return lines.join('\n');
}

// Follows Link headers: the Dependabot alerts API only supports cursor
// pagination and rejects page numbers.
async function githubList(path, limit = 2000) {
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(
    /\/$/u,
    ''
  );
  const items = [];
  let url = `${api}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url && items.length < limit) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    items.push(...(await response.json()));
    url = /<([^>]+)>;\s*rel="next"/u.exec(
      response.headers.get('link') ?? ''
    )?.[1];
  }
  return items;
}

async function collect(source, load, convert, coverage) {
  try {
    const entries = convert(await load());
    coverage.push({ source, status: 'scanned' });
    return entries;
  } catch (error) {
    coverage.push({ reason: error.message, source, status: 'unavailable' });
    return [];
  }
}

function readOptionalJson(file, label) {
  if (!file || !fs.existsSync(file)) throw new Error(`${label} output missing`);
  const text = fs.readFileSync(file, 'utf8').trim();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  const coverage = [];
  const alerts = (kind, state) => () =>
    githubList(`/repos/${repo}/${kind}/alerts?state=${state}`);
  const entries = [
    ...(await collect(
      'bun-audit',
      () => readOptionalJson(env.BUN_AUDIT_FILE, 'bun audit') ?? {},
      fromBunAudit,
      coverage
    )),
    ...(await collect(
      'gitleaks',
      () => readOptionalJson(env.GITLEAKS_FILE, 'gitleaks') ?? [],
      fromGitleaks,
      coverage
    )),
    ...(await collect(
      'dependabot',
      async () => [
        ...(await alerts('dependabot', 'open')()),
        ...(await alerts('dependabot', 'fixed')()).slice(0, 100),
      ],
      fromDependabot,
      coverage
    )),
    ...(await collect(
      'code-scanning',
      async () => [
        ...(await alerts('code-scanning', 'open')()),
        ...(await alerts('code-scanning', 'fixed')()).slice(0, 100),
      ],
      fromCodeScanning,
      coverage
    )),
  ];
  coverage.push({
    reason: 'GITHUB_TOKEN cannot read secret scanning alerts; reviewed weekly',
    source: 'secret-scanning',
    status: 'unavailable',
  });
  const acceptances = readAcceptances(
    env.RISK_ACCEPTANCES_FILE || '.github/security/risk-acceptances.json',
    coverage
  );
  const register = buildRegister({
    coverage,
    entries: applyAcceptances(entries, acceptances),
    generatedAt: new Date().toISOString(),
    sha: env.GITHUB_SHA,
  });
  fs.writeFileSync(env.REGISTER_FILE, `${JSON.stringify(register, null, 2)}\n`);
  const summary = summarize(register);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(summary);
  if (register.blockers.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  applyAcceptances,
  buildRegister,
  fromBunAudit,
  fromCodeScanning,
  fromDependabot,
  fromGitleaks,
  stableId,
  summarize,
};
