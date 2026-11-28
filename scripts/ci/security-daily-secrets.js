#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Reviewed false positives, each pinned to rule, location and exact line bytes.
// This is not a path allowlist: another value at the same location still fails.
const DEMO_JWTS = [
  { file: 'apps/web/e2e/helpers/environment.ts', line: 10 },
  { file: 'scripts/e2e-local-environment.js', line: 13 },
].map((entry) => ({
  ...entry,
  rule: 'jwt',
  digest: '77e3598e8e9e9dc357dd10c5dcfc908706d2762611ffdbaae0a7cbc4d00e3a04',
  reason: 'Public Supabase local-demo JWT used by E2E fixtures.',
}));
const ACCEPTED_FINDINGS = [
  ...DEMO_JWTS,
  {
    file: 'packages/sdk/src/cli/upskii/product-commands.test.ts',
    line: 434,
    rule: 'generic-api-key',
    digest: 'da7f19afca6a94fb852a7dab5b97ea065b3972c003a03ce9bff7b2263100d1be',
    reason: 'Synthetic CLI session access token in a unit-test config stub.',
  },
];

function readFindingLine(finding) {
  const source = execFileSync(
    'git',
    ['show', `${finding.Commit}:${finding.File}`],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
  return source.split('\n')[finding.StartLine - 1];
}
function allowFinding(finding, readLine = readFindingLine) {
  if (!/^[0-9a-f]{40}$/.test(finding.Commit || '')) return false;
  const accepted = ACCEPTED_FINDINGS.find(
    (entry) =>
      entry.rule === finding.RuleID &&
      entry.file === finding.File &&
      entry.line === finding.StartLine &&
      entry.line === finding.EndLine
  );
  if (!accepted) return false;
  try {
    const line = readLine(finding);
    return (
      typeof line === 'string' &&
      crypto.createHash('sha256').update(line).digest('hex') === accepted.digest
    );
  } catch {
    return false;
  }
}
function summarize(report) {
  if (!Array.isArray(report)) throw new Error('Invalid gitleaks report');
  return report
    .filter((f) => !allowFinding(f))
    .map((f) => ({
      file: f.File,
      line: f.StartLine,
      rule: f.RuleID,
      commit: f.Commit,
    }));
}
if (require.main === module) {
  try {
    const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const findings = summarize(report);
    fs.writeFileSync(
      process.argv[3],
      `${JSON.stringify({ findings }, null, 2)}\n`
    );
    console.log(
      'Secret diff: ' +
        findings.length +
        ' new finding(s); values are never printed.'
    );
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { ACCEPTED_FINDINGS, DEMO_JWTS, allowFinding, summarize };
