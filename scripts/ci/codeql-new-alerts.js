#!/usr/bin/env node
// Fails a pull request only for high/critical CodeQL results the diff
// introduced. Pre-existing alerts are tracked by the findings register, so the
// baseline is the latest default-branch analysis for the same category, matched
// by rule and GitHub's primary location fingerprint.
const fs = require('node:fs');
const path = require('node:path');

const { env } = process;

const highSeverity = 7;
// A result whose rule is unknown, or whose security-severity is missing, null,
// empty or not a plain number, is treated as critical: an unreadable severity
// must never pass as 0. The bootstrap jq gate in codeql.yml uses the same rule.
const unresolvedSeverity = 10;

function parseSeverity(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^[0-9]+(?:\.[0-9]+)?$/u.test(value)) {
    return Number(value);
  }
  return null;
}

function ruleSeverity(run, result) {
  const rules = [
    ...(run.tool?.driver?.rules ?? []),
    ...(run.tool?.extensions ?? []).flatMap(
      (extension) => extension.rules ?? []
    ),
  ];
  const rule =
    rules.find((candidate) => candidate.id === result.ruleId) ??
    run.tool?.driver?.rules?.[result.ruleIndex ?? result.rule?.index];
  return (
    parseSeverity(rule?.properties?.['security-severity']) ?? unresolvedSeverity
  );
}

function findings(sarif) {
  return (sarif?.runs ?? []).flatMap((run) =>
    (run.results ?? []).map((result) => {
      const location = result.locations?.[0]?.physicalLocation;
      const uri = location?.artifactLocation?.uri ?? '';
      const fingerprint =
        result.partialFingerprints?.primaryLocationLineHash ??
        `${uri}:${result.message?.text ?? ''}`;
      const ruleId = result.ruleId ?? result.rule?.id ?? 'unknown';
      return {
        key: `${ruleId}|${fingerprint}`,
        line: location?.region?.startLine ?? 0,
        ruleId,
        severity: ruleSeverity(run, result),
        uri,
      };
    })
  );
}

function newHighFindings(head, base) {
  const known = new Set(findings(base).map(({ key }) => key));
  return findings(head).filter(
    ({ key, severity }) => severity >= highSeverity && !known.has(key)
  );
}

function label(severity) {
  return severity >= 9 ? 'critical' : 'high';
}

async function github(url, accept) {
  const response = await fetch(url, {
    headers: {
      accept,
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok)
    throw new Error(`GET ${url} failed with ${response.status}`);
  return response.json();
}

async function baselineSarif({ category, ref, repo }) {
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(
    /\/$/u,
    ''
  );
  const query = new URLSearchParams({
    per_page: '50',
    ref,
    tool_name: 'CodeQL',
  });
  const analyses = await github(
    `${api}/repos/${repo}/code-scanning/analyses?${query}`,
    'application/vnd.github+json'
  );
  const analysis = analyses.find(
    (candidate) => candidate.category === category && !candidate.error
  );
  if (!analysis) throw new Error(`no ${category} analysis on ${ref}`);
  return github(
    `${api}/repos/${repo}/code-scanning/analyses/${analysis.id}`,
    'application/sarif+json'
  );
}

async function main(argv = process.argv.slice(2)) {
  const [sarifDir, category] = argv;
  const files = fs
    .readdirSync(sarifDir)
    .filter((file) => file.endsWith('.sarif'))
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(sarifDir, file), 'utf8'))
    );
  const head = { runs: files.flatMap((sarif) => sarif.runs ?? []) };
  const headHigh = findings(head).filter(
    ({ severity }) => severity >= highSeverity
  );
  let fresh;
  try {
    const base = await baselineSarif({
      category,
      ref: env.BASELINE_REF,
      repo: env.GITHUB_REPOSITORY,
    });
    fresh = newHighFindings(head, base);
  } catch (error) {
    // Without a baseline nothing proves a high result pre-existed.
    console.error(`CodeQL baseline unavailable: ${error.message}`);
    fresh = headHigh;
  }
  console.log(
    `${category}: ${headHigh.length} high/critical result(s) at head, ${fresh.length} not in the ${env.BASELINE_REF} baseline.`
  );
  // The repository is public: logs carry counts only. Rule IDs, paths and
  // messages stay in the maintainer-only code-scanning view.
  if (fresh.length > 0) {
    const critical = fresh.filter(
      ({ severity }) => label(severity) === 'critical'
    ).length;
    console.log(
      `::error::${fresh.length} new high/critical CodeQL result(s) (${critical} critical, ${fresh.length - critical} high); review them in the repository's Security tab (code scanning, category ${category}).`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  findings,
  main,
  highSeverity,
  newHighFindings,
  unresolvedSeverity,
};
