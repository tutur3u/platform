#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// These public supabase-demo fixtures are pinned to exact historical line bytes.
// This is not a path allowlist: another value at either location still fails.
const DEMO_JWTS = [
  { file: 'apps/web/e2e/helpers/environment.ts', line: 10 },
  { file: 'scripts/e2e-local-environment.js', line: 13 },
].map((entry) => ({
  ...entry,
  digest: '77e3598e8e9e9dc357dd10c5dcfc908706d2762611ffdbaae0a7cbc4d00e3a04',
}));

function readFindingLine(finding) {
  const source = execFileSync(
    'git',
    ['show', finding.Commit + ':' + finding.File],
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
  if (!/^[0-9a-f]{40}$/.test(finding.Commit || '') || finding.RuleID !== 'jwt')
    return false;
  const accepted = DEMO_JWTS.find(
    (entry) =>
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
      JSON.stringify({ findings }, null, 2) + '\n'
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
module.exports = { DEMO_JWTS, allowFinding, summarize };
