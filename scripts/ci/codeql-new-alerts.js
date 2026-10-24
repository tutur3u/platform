#!/usr/bin/env node
// Fails a pull request only for high/critical CodeQL results the diff
// introduced. Pre-existing alerts are tracked by the findings register, so the
// baseline is the latest default-branch analysis for the same category, matched
// by rule and GitHub's primary location fingerprint.
const fs = require('node:fs');
const path = require('node:path');

const { env } = process;

const highSeverity = 7;
// At most 1,000 analyses are inspected for a category's baseline.
const maxAnalysisPages = 10;
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

function escapeAnnotation(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
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
  // Analyses of every category are listed newest first, and frequent
  // categories (one per main push) can bury a daily one, so page until the
  // newest analysis of this category is found, within a fixed bound.
  let analysis;
  for (let page = 1; page <= maxAnalysisPages && !analysis; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      per_page: '100',
      ref,
      tool_name: 'CodeQL',
    });
    const analyses = await github(
      `${api}/repos/${repo}/code-scanning/analyses?${query}`,
      'application/vnd.github+json'
    );
    if (!Array.isArray(analyses)) break;
    analysis = analyses.find(
      (candidate) => candidate.category === category && !candidate.error
    );
    if (analyses.length < 100) break;
  }
  if (!analysis) throw new Error(`no ${category} analysis on ${ref}`);
  return github(
    `${api}/repos/${repo}/code-scanning/analyses/${analysis.id}`,
    'application/sarif+json'
  );
}

// The analysis output must exist and be well formed: no SARIF file, an
// unreadable or malformed one, or one without runs means CodeQL did not
// produce results, which must never read as "no new findings".
function readHeadSarif(sarifDir) {
  let names;
  try {
    names = fs.readdirSync(sarifDir).filter((file) => file.endsWith('.sarif'));
  } catch {
    throw new Error(
      'CodeQL output unavailable: the SARIF directory is unreadable'
    );
  }
  if (names.length === 0) {
    throw new Error('CodeQL output unavailable: no SARIF file to gate');
  }
  return names.map((name) => {
    let sarif;
    try {
      sarif = JSON.parse(fs.readFileSync(path.join(sarifDir, name), 'utf8'));
    } catch {
      throw new Error(
        'CodeQL output unavailable: a SARIF file is unreadable or malformed'
      );
    }
    if (!Array.isArray(sarif?.runs) || sarif.runs.length === 0) {
      throw new Error('CodeQL output unavailable: a SARIF file has no runs');
    }
    return sarif;
  });
}

async function main(argv = process.argv.slice(2)) {
  const [sarifDir, category] = argv;
  const head = { runs: readHeadSarif(sarifDir).flatMap(({ runs }) => runs) };
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
  if (fresh.length > 0) {
    for (const { line, ruleId, severity, uri } of fresh) {
      const location = uri ? `${uri}:${line}` : 'unknown location';
      console.log(
        `::error::${escapeAnnotation(`CodeQL ${label(severity)} result: ${ruleId} at ${location}`)}`
      );
    }
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
