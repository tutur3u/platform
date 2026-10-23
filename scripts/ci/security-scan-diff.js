#!/usr/bin/env node
// Turns raw scanner output into PR gate decisions and redacted register input.
//   bun-audit-diff <head.json> <base.json>  fail on new high/critical advisories
//     (security-checks.yaml loads this file from the base commit; logs: counts)
//   gitleaks <report.json> <redacted.json> pr|register
//     pr: annotate locations the PR itself introduced and fail on any finding
//     register: keep only opaque IDs and rules; public logs show counts only
const crypto = require('node:crypto');
const fs = require('node:fs');

const blockingSeverities = new Set(['critical', 'high']);

function readJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return text ? JSON.parse(text) : fallback;
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// `bun audit --json` maps package names to advisory lists.
function auditAdvisories(report) {
  return Object.entries(report ?? {}).flatMap(([pkg, advisories]) =>
    (Array.isArray(advisories) ? advisories : []).map((advisory) => ({
      advisory: String(advisory.url ?? advisory.id)
        .split('/')
        .pop(),
      key: `${pkg}|${advisory.url ?? advisory.id}`,
      package: pkg,
      severity: String(advisory.severity ?? 'unknown').toLowerCase(),
      title: advisory.title ?? '',
      vulnerableVersions: advisory.vulnerable_versions ?? '',
    }))
  );
}

function newBlockingAdvisories(head, base) {
  const known = new Set(auditAdvisories(base).map(({ key }) => key));
  return auditAdvisories(head).filter(
    ({ key, severity }) => blockingSeverities.has(severity) && !known.has(key)
  );
}

function fingerprintId(value) {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex')
    .slice(0, 16);
}

// Gitleaks runs with --redact; only rule, location and an opaque ID are kept,
// and register mode drops locations because scheduled logs and artifacts of a
// public repository are public.
function redactGitleaks(report, { locations = true } = {}) {
  return (Array.isArray(report) ? report : []).map((finding) => ({
    id: fingerprintId(finding.Fingerprint ?? JSON.stringify(finding)),
    rule: finding.RuleID ?? 'unknown',
    ...(locations
      ? {
          commit: String(finding.Commit ?? '').slice(0, 12),
          file: finding.File ?? '',
          line: finding.StartLine ?? 0,
        }
      : {}),
  }));
}

function main(argv = process.argv.slice(2)) {
  const [command, first, second] = argv;
  if (command === 'bun-audit-diff') {
    const fresh = newBlockingAdvisories(
      readJson(first, {}),
      readJson(second, {})
    );
    // Public logs carry counts only; `bun audit` locally (or Dependabot)
    // names the advisories for maintainers.
    const critical = fresh.filter(
      ({ severity }) => severity === 'critical'
    ).length;
    console.log(
      `${fresh.length} new high/critical dependency advisory(ies) (${critical} critical, ${fresh.length - critical} high).`
    );
    if (fresh.length > 0) {
      console.log(
        '::error::New high/critical dependency advisories; run `bun audit` locally or check Dependabot alerts.'
      );
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'gitleaks') {
    const mode = argv[3];
    if (!['pr', 'register'].includes(mode))
      throw new Error('mode must be pr|register');
    const redacted = redactGitleaks(readJson(first, []), {
      locations: mode === 'pr',
    });
    fs.writeFileSync(second, `${JSON.stringify(redacted, null, 2)}\n`);
    if (mode === 'pr') {
      for (const item of redacted) {
        console.log(
          `::error file=${item.file},line=${item.line}::Possible secret (${item.rule}) in ${item.commit}; rotate it before removing it from history`
        );
      }
    }
    console.log(
      `${redacted.length} possible secret(s); values are never printed.`
    );
    if (mode === 'pr' && redacted.length > 0) process.exitCode = 1;
    return;
  }
  throw new Error('usage: security-scan-diff.js bun-audit-diff|gitleaks ...');
}

if (require.main === module) main();

module.exports = {
  auditAdvisories,
  fingerprintId,
  main,
  newBlockingAdvisories,
  redactGitleaks,
};
