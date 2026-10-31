#!/usr/bin/env node
// Post-bootstrap admission of NEW security-definer verified records.
//
// CI runs this module from the trusted base commit (security-checks.yaml), so
// the pinned attester identity, canonicalization and hash below can only be
// changed through a reviewed merge, never by the pull request being checked.
// Base records stay append-only and byte-identical; an addition must bind a
// finding that the trusted guard recomputes over a migration ADDED by the pull
// request, and must be covered by an independent attestation status that the
// release bot posted on the exact head SHA. Every failure, including API
// errors, rejects the run.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifiedFindingMatches } = require('./security-definer-blocks');

const LEDGER = 'security-definer-verified-findings.json';
const MIGRATIONS = 'apps/database/supabase/migrations/';
const REPOSITORY = 'tutur3u/platform';
const ATTESTATION_CONTEXT = 'security/definer-record-admission';
const ATTESTER = Object.freeze({
  login: 'tuturuuu-release-bot',
  id: 348951514,
});
const STATUS_PAGES = 10;
const SHA = /^[0-9a-f]{40}$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

// sha256 over the canonical JSON (sorted keys, sorted records) of exactly the
// NEW records. Any extra, missing or edited addition changes the digest.
function recordsDigest(records) {
  const body = `[${records.map(canonicalJson).sort().join(',')}]`;
  return crypto.createHash('sha256').update(body).digest('hex');
}

function attestationDescription(records) {
  return `definer-records sha256:${recordsDigest(records)}`;
}

// D1: every trusted record must still appear, byte-identical; whatever is left
// over is an addition. Edits and removals fail before any scan.
function splitVerifiedRecords(trusted, proposed) {
  if (!Array.isArray(trusted) || !Array.isArray(proposed))
    throw new Error('Verified finding ledgers must be JSON arrays.');
  const remaining = proposed.map((entry) => JSON.stringify(entry));
  for (const entry of trusted) {
    const index = remaining.indexOf(JSON.stringify(entry));
    if (index === -1)
      throw new Error(
        `Verified finding record changed or removed (base records are append-only): ${entry.file}`
      );
    remaining.splice(index, 1);
  }
  const additions = remaining.map((entry) => JSON.parse(entry));
  const seen = new Set();
  for (const entry of additions) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Verified finding additions must be objects.');
    const key = canonicalJson(entry);
    if (seen.has(key))
      throw new Error(`Duplicate verified finding addition: ${entry.file}`);
    seen.add(key);
  }
  return additions;
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveShas(root, env) {
  const base = env.BASE_SHA;
  const head = env.HEAD_SHA;
  if (!SHA.test(base ?? '') || !SHA.test(head ?? ''))
    throw new Error(
      'Verified finding additions need full BASE_SHA and HEAD_SHA values.'
    );
  // The head must be the checked-out commit or the PR side of the merge
  // checkout, so an attestation for some other commit cannot be substituted.
  const checkout = [git(root, ['rev-parse', 'HEAD']).trim()];
  try {
    checkout.push(git(root, ['rev-parse', '--verify', 'HEAD^2']).trim());
  } catch {}
  if (!checkout.includes(head))
    throw new Error(
      `HEAD_SHA ${head} is not the checked-out pull request head.`
    );
  return { base, head };
}

// D2: the migrations this change ADDED relative to the base. Renamed, copied
// and modified files never qualify, nor does any path the base already has.
function addedMigrations(root, base, head) {
  const fields = git(root, [
    'diff',
    '--name-status',
    '-z',
    '-M',
    '--no-ext-diff',
    '--no-textconv',
    `${base}...${head}`,
    '--',
    MIGRATIONS,
  ]).split('\0');
  const added = new Set();
  for (let index = 0; index < fields.length - 1; ) {
    const status = fields[index];
    const paths = /^[RC]/.test(status) ? 2 : 1;
    if (status === 'A') added.add(fields[index + 1]);
    index += 1 + paths;
  }
  for (const file of added) {
    let existed = true;
    try {
      git(root, ['cat-file', '-e', `${base}:${file}`]);
    } catch {
      existed = false;
    }
    if (existed) added.delete(file);
  }
  return added;
}

// D2: each addition must match a finding the trusted guard recomputed over the
// pull request's bytes (path, line, rule, signature, digest, sourceDigest).
function bindAdditions(additions, findings, added) {
  for (const entry of additions) {
    if (
      typeof entry.file !== 'string' ||
      !entry.file.startsWith(MIGRATIONS) ||
      !added.has(entry.file)
    )
      throw new Error(
        `Verified finding addition must target a migration added by this change: ${entry.file}`
      );
    if (
      !findings.some((finding) =>
        verifiedFindingMatches(
          entry,
          finding.file,
          finding,
          finding.sourceDigest
        )
      )
    )
      throw new Error(
        `Verified finding addition matches no recomputed finding: ${entry.file}:${entry.line} ${entry.rule} ${entry.signature}`
      );
  }
  return findings.filter(
    (finding) =>
      !additions.some((entry) =>
        verifiedFindingMatches(
          entry,
          finding.file,
          finding,
          finding.sourceDigest
        )
      )
  );
}

// D3: the newest status for the context on the exact head SHA must be a
// success from the pinned attester whose description carries the digest.
async function verifyAttestation({ additions, head, token, fetch }) {
  if (!token)
    throw new Error(
      'Definer record attestation needs GITHUB_TOKEN (statuses: read).'
    );
  if (typeof fetch !== 'function')
    throw new Error('Definer record attestation needs fetch.');
  const expected = attestationDescription(additions);
  for (let page = 1; page <= STATUS_PAGES; page += 1) {
    let statuses;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/commits/${head}/statuses?per_page=100&page=${page}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      statuses = await response.json();
    } catch (error) {
      throw new Error(
        `Definer record attestation lookup failed: ${error.message}`
      );
    }
    if (!Array.isArray(statuses))
      throw new Error(
        'Definer record attestation lookup returned no status list.'
      );
    const status = statuses.find(
      (entry) => entry?.context === ATTESTATION_CONTEXT
    );
    if (status) {
      if (
        status.state !== 'success' ||
        status.creator?.login !== ATTESTER.login ||
        status.creator?.id !== ATTESTER.id
      )
        throw new Error(
          `Definer record attestation on ${head} is not a success from ${ATTESTER.login}.`
        );
      if (status.description !== expected)
        throw new Error(
          `Definer record attestation does not cover exactly the new records (expected "${expected}").`
        );
      return expected;
    }
    if (statuses.length < 100) break;
  }
  throw new Error(
    `Missing ${ATTESTATION_CONTEXT} status on ${head}; expected "${expected}".`
  );
}

// Entry point for the trusted guard. `scan` runs checkRepository with the given
// verified records; additions are never used to suppress findings unless they
// pass every check above.
async function admitVerifiedFindings({
  root,
  trustedDirectory,
  scan,
  env = process.env,
  fetch = globalThis.fetch,
}) {
  const read = (directory) =>
    JSON.parse(fs.readFileSync(path.join(directory, LEDGER), 'utf8'));
  const trusted = read(trustedDirectory);
  const additions = splitVerifiedRecords(
    trusted,
    read(path.join(root, 'scripts/ci'))
  );
  const findings = scan(trusted);
  if (!additions.length) return findings;
  const { base, head } = resolveShas(root, env);
  const remaining = bindAdditions(
    additions,
    findings,
    addedMigrations(root, base, head)
  );
  const description = await verifyAttestation({
    additions,
    head,
    token: env.GITHUB_TOKEN,
    fetch,
  });
  console.log(
    `Admitted ${additions.length} attested verified finding record(s): ${description}`
  );
  return remaining;
}

module.exports = {
  ATTESTATION_CONTEXT,
  ATTESTER,
  REPOSITORY,
  addedMigrations,
  admitVerifiedFindings,
  attestationDescription,
  bindAdditions,
  canonicalJson,
  recordsDigest,
  splitVerifiedRecords,
  verifyAttestation,
};

// Operator helper used by the attestation command: prints the additions and
// the exact status description for a trusted and a proposed ledger.
if (require.main === module) {
  try {
    const [command, trustedFile, proposedFile] = process.argv.slice(2);
    if (command !== 'digest' || !trustedFile || !proposedFile)
      throw new Error(
        'Usage: security-definer-admission.js digest <base-ledger.json> <head-ledger.json>'
      );
    const additions = splitVerifiedRecords(
      JSON.parse(fs.readFileSync(trustedFile, 'utf8')),
      JSON.parse(fs.readFileSync(proposedFile, 'utf8'))
    );
    if (!additions.length) throw new Error('No new verified finding records.');
    console.log(
      JSON.stringify(
        {
          context: ATTESTATION_CONTEXT,
          count: additions.length,
          description: attestationDescription(additions),
          records: additions,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
