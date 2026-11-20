#!/usr/bin/env node
// Post-bootstrap admission of NEW security-definer verified records.
//
// CI runs this module from the trusted base commit (security-checks.yaml), so
// the sign-off provenance checks, canonicalization and hash can only be
// changed through a reviewed merge, never by the pull request being checked.
// Base records stay append-only and byte-identical; an addition must bind a
// finding that the trusted guard recomputes and bind either a new migration
// or an unchanged historical migration with a new verified remediation. Each
// addition must be covered by an independent attestation status that the
// release bot posted on the exact head SHA. Every failure, including API
// errors, rejects the run.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  ATTESTATION_CONTEXT,
  ATTESTER,
  REPOSITORY,
  verifySignoff,
} = require('./security-definer-signoff-proof');
const { verifiedFindingMatches } = require('./security-definer-blocks');

const LEDGER = 'security-definer-verified-findings.json';
const MIGRATIONS = 'apps/database/supabase/migrations/';
const RISK_ACCEPTANCES = '.github/security/risk-acceptances.json';
const MIGRATION_PATH =
  /^apps\/database\/supabase\/migrations\/(\d{14})_[\w-]+\.sql$/;
const RECORD_KEYS = [
  'file',
  'line',
  'rule',
  'signature',
  'digest',
  'sourceDigest',
];
const sha256 = (source) =>
  crypto.createHash('sha256').update(source).digest('hex');
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

// Additions alone keep the original description. Rebinds switch to a digest
// over both lists, so one status covers exactly the additions and rebinds.
function attestationDescription(records, rebinds = []) {
  if (!rebinds.length)
    return `definer-records sha256:${recordsDigest(records)}`;
  const body = canonicalJson({
    additions: records.map(canonicalJson).sort(),
    rebinds: rebinds.map(({ from, to }) => canonicalJson({ from, to })).sort(),
  });
  return `definer-rebinds sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function withoutSourceDigest(entry) {
  const { sourceDigest: _ignored, ...rest } = entry ?? {};
  return canonicalJson(rest);
}

// A rebind changes only sourceDigest or adds the proof fields for a scoped
// legacy record. Both variants still require successful head attestation.
function withoutRemediation(entry) {
  const { remediationMigration, remediationDigest, ...legacy } = entry;
  return legacy;
}

function splitLedger(trusted, proposed) {
  if (!Array.isArray(trusted) || !Array.isArray(proposed))
    throw new Error('Verified finding ledgers must be JSON arrays.');
  const remaining = proposed.map((entry) => JSON.stringify(entry));
  const missing = [];
  for (const entry of trusted) {
    const index = remaining.indexOf(JSON.stringify(entry));
    if (index === -1) missing.push(entry);
    else remaining.splice(index, 1);
  }
  const leftovers = remaining.map((entry) => JSON.parse(entry));
  const rebinds = [];
  for (const from of missing) {
    const matches = leftovers.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof entry.sourceDigest === 'string' &&
        entry.sourceDigest !== from.sourceDigest &&
        withoutSourceDigest(entry) === withoutSourceDigest(from)
    );
    if (matches.length === 0 && !from.remediationMigration) {
      matches.push(
        ...leftovers.filter(
          (entry) =>
            entry &&
            entry.remediationMigration &&
            entry.remediationDigest &&
            canonicalJson(withoutRemediation(entry)) === canonicalJson(from)
        )
      );
    }
    if (matches.length !== 1)
      throw new Error(
        `Verified finding record changed or removed (base records are append-only): ${from.file}`
      );
    leftovers.splice(leftovers.indexOf(matches[0]), 1);
    rebinds.push({ from, to: matches[0] });
  }
  const additions = splitVerifiedRecords([], leftovers);
  return { additions, rebinds };
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
  for (let index = 0; index < fields.length - 1;) {
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

// D2 for rebinds: migrations this change MODIFIED in place (status M) that the
// base already has. Added, renamed and copied files never qualify.
function modifiedMigrations(root, base, head) {
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
  const modified = new Set();
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index];
    const paths = /^[RC]/.test(status) ? 2 : 1;
    if (status === 'M') modified.add(fields[index + 1]);
    index += 1 + paths;
  }
  for (const file of modified) {
    try {
      git(root, ['cat-file', '-e', `${base}:${file}`]);
    } catch {
      modified.delete(file);
    }
  }
  return modified;
}

// Each rebind must target a modified migration and match a finding the trusted
// guard recomputed over the pull request's bytes.
function bindRebinds(rebinds, findings, modified, proveLegacy) {
  for (const { from, to } of rebinds) {
    const upgraded = !from.remediationMigration && to.remediationMigration;
    if (
      (upgraded && !proveLegacy?.(from, to)) ||
      (!upgraded && to.remediationMigration)
    )
      throw new Error(
        `Verified finding rebind lacks an approved remediation: ${to.file}`
      );
    if (
      !upgraded &&
      (typeof to.file !== 'string' ||
        !to.file.startsWith(MIGRATIONS) ||
        !modified.has(to.file))
    )
      throw new Error(
        `Verified finding rebind must target a migration modified by this change: ${to.file}`
      );
    if (
      !findings.some((finding) =>
        verifiedFindingMatches(to, finding.file, finding, finding.sourceDigest)
      )
    )
      throw new Error(
        `Verified finding rebind matches no recomputed finding: ${to.file}:${to.line} ${to.rule} ${to.signature}`
      );
  }
}

function applyRebinds(trusted, rebinds) {
  return trusted.map(
    (entry) => rebinds.find(({ from }) => from === entry)?.to ?? entry
  );
}

// D2: each addition must match a finding the trusted guard recomputed over the
// pull request's bytes (path, line, rule, signature, digest, sourceDigest).
function bindAdditions(additions, findings, added, proveFixForward) {
  for (const entry of additions) {
    if (
      typeof entry.file !== 'string' ||
      !entry.file.startsWith(MIGRATIONS) ||
      (entry.remediationMigration
        ? !proveFixForward?.(entry)
        : !added.has(entry.file))
    )
      throw new Error(
        `Verified finding addition must target a migration added by this change or prove a fix-forward: ${entry.file}`
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

// D3: require the exact ledger digest and approved workflow provenance.
function verifyAttestation({ additions, rebinds = [], head, token, fetch }) {
  return verifySignoff({
    head,
    expected: attestationDescription(additions, rebinds),
    token,
    fetch,
  });
}

function readRiskAcceptances(root, env) {
  let source;
  if (SHA.test(env.BASE_SHA ?? '')) {
    try {
      source = git(root, ['show', `${env.BASE_SHA}:${RISK_ACCEPTANCES}`]);
    } catch {
      // A base predating the acceptance register has no exceptions.
      git(root, ['cat-file', '-e', `${env.BASE_SHA}^{commit}`]);
      return [];
    }
  } else {
    const file = path.join(root, RISK_ACCEPTANCES);
    if (!fs.existsSync(file)) return [];
    source = fs.readFileSync(file, 'utf8');
  }
  const ledger = JSON.parse(source);
  if (
    ledger.format !== 'tuturuuu-risk-acceptances/v1' ||
    !Array.isArray(ledger.acceptances)
  )
    throw new Error('Invalid trusted risk acceptance register.');
  return ledger.acceptances.filter((entry) => entry.kind === 'definer-records');
}

function riskFor(risks, entry) {
  return risks.find(
    (risk) =>
      risk.scope?.ledger === `scripts/ci/${LEDGER}` &&
      risk.scope.records?.some((record) =>
        RECORD_KEYS.every(
          (key) =>
            record[key] === entry[key] ||
            (key === 'sourceDigest' && record[key] === undefined)
        )
      )
  );
}

function riskActive(risk, now) {
  const proposed = Date.parse(risk.proposedAt);
  const approved = Date.parse(risk.approvedAt);
  const expires = Date.parse(risk.expiresAt);
  return (
    risk.status === 'accepted' &&
    Boolean(risk.approvedBy?.trim()) &&
    proposed <= approved &&
    approved <= now &&
    now < expires &&
    expires - proposed <= 90 * 24 * 60 * 60 * 1000
  );
}

function remediationValid(entry, paths, read, verify) {
  const originalVersion = MIGRATION_PATH.exec(entry.file)?.[1];
  const remediationVersion = MIGRATION_PATH.exec(
    entry.remediationMigration
  )?.[1];
  if (
    !verify ||
    !originalVersion ||
    !remediationVersion ||
    remediationVersion <= originalVersion ||
    !paths.includes(entry.file) ||
    !paths.includes(entry.remediationMigration)
  )
    return false;
  const original = read(entry.file);
  const sql = read(entry.remediationMigration);
  if (
    original === undefined ||
    sql === undefined ||
    sha256(original) !== entry.sourceDigest ||
    sha256(sql) !== entry.remediationDigest
  )
    return false;
  const ordered = paths
    .filter((file) => {
      const version = MIGRATION_PATH.exec(file)?.[1];
      return (
        version && version >= originalVersion && version <= remediationVersion
      );
    })
    .sort();
  const versions = new Set(ordered.map((file) => MIGRATION_PATH.exec(file)[1]));
  if (versions.size !== ordered.length) return false;
  const intervening = ordered.slice(1, -1).map(read);
  return (
    intervening.every((source) => source !== undefined) &&
    verify(sql, { original, entry, intervening })
  );
}

function trustedRecordsForScan(
  root,
  trusted,
  verifyRemediation,
  risks = readRiskAcceptances(root, {}),
  now = Date.now()
) {
  const workingPaths = () =>
    git(root, ['ls-files', '-z', '--', MIGRATIONS]).split('\0').filter(Boolean);
  const diskRead = (file) => {
    try {
      return fs.readFileSync(path.join(root, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    }
  };
  return trusted.filter((entry) => {
    if (entry.remediationMigration)
      return remediationValid(
        entry,
        workingPaths(),
        diskRead,
        verifyRemediation
      );
    const risk = riskFor(risks, entry);
    if (!risk) return true;
    return (
      riskActive(risk, now) &&
      remediationValid(
        {
          ...entry,
          remediationMigration: risk.remediatedBy,
          remediationDigest: risk.remediationDigest,
        },
        workingPaths(),
        diskRead,
        verifyRemediation
      )
    );
  });
}

// Entry point for the trusted guard. `scan` runs checkRepository with the given
// verified records; additions are never used to suppress findings unless they
// pass every check above.
async function admitVerifiedFindings({
  root,
  trustedDirectory,
  scan,
  verifyRemediation,
  env = process.env,
  fetch = globalThis.fetch,
  now = Date.now(),
}) {
  const read = (directory) =>
    JSON.parse(fs.readFileSync(path.join(directory, LEDGER), 'utf8'));
  const trusted = read(trustedDirectory);
  const { additions, rebinds } = splitLedger(
    trusted,
    read(path.join(root, 'scripts/ci'))
  );
  const risks = readRiskAcceptances(root, env);
  const pendingUpgrade = new Set(
    rebinds
      .filter(
        ({ from, to }) => !from.remediationMigration && to.remediationMigration
      )
      .map(({ from }) => from)
  );
  const continuingLegacyRisks = trusted
    .filter(
      (entry) => !entry.remediationMigration && !pendingUpgrade.has(entry)
    )
    .map((entry) => riskFor(risks, entry))
    .filter(Boolean);
  if (continuingLegacyRisks.length) {
    const proposedRisks = readRiskAcceptances(root, {});
    for (const risk of continuingLegacyRisks) {
      if (
        !proposedRisks.some(
          (entry) => canonicalJson(entry) === canonicalJson(risk)
        )
      )
        throw new Error(
          `Definer risk acceptance changed before its records were attested: ${risk.id}`
        );
    }
  }
  const active = trustedRecordsForScan(
    root,
    trusted.filter((entry) => !pendingUpgrade.has(entry)),
    verifyRemediation,
    risks,
    now
  );
  const findings = scan(active);
  if (!additions.length && !rebinds.length) return findings;
  const { base, head } = resolveShas(root, env);
  const added = addedMigrations(root, base, head);
  const headPaths = git(root, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    head,
    '--',
    MIGRATIONS,
  ])
    .split('\0')
    .filter(Boolean);
  const headRead = (file) => git(root, ['show', `${head}:${file}`]);
  const prove = (entry) =>
    headRead(entry.file) === git(root, ['show', `${base}:${entry.file}`]) &&
    remediationValid(entry, headPaths, headRead, verifyRemediation);
  const proveFixForward = (entry) =>
    added.has(entry.remediationMigration) && prove(entry);
  const proveLegacy = (from, to) => {
    const risk = riskFor(risks, from);
    return (
      risk?.remediatedBy === to.remediationMigration &&
      risk.remediationDigest === to.remediationDigest &&
      riskActive(risk, Date.parse(risk.approvedAt)) &&
      prove(to)
    );
  };
  if (rebinds.length)
    bindRebinds(
      rebinds,
      findings,
      modifiedMigrations(root, base, head),
      proveLegacy
    );
  const remaining = bindAdditions(additions, findings, added, proveFixForward);
  const description = await verifyAttestation({
    additions,
    rebinds,
    head,
    token: env.GITHUB_TOKEN,
    fetch,
  });
  console.log(
    `Admitted ${additions.length} attested verified finding record(s) and ${rebinds.length} rebind(s): ${description}`
  );
  // Attested rebinds join the trusted set the guard scans with, so they
  // suppress exactly like base records; additions still filter afterwards.
  if (!rebinds.length) return remaining;
  return bindAdditions(
    additions,
    scan(
      applyRebinds(active, rebinds).concat(
        rebinds
          .filter(({ from }) => pendingUpgrade.has(from))
          .map(({ to }) => to)
      )
    ),
    added,
    proveFixForward
  );
}

module.exports = {
  ATTESTATION_CONTEXT,
  ATTESTER,
  REPOSITORY,
  addedMigrations,
  admitVerifiedFindings,
  attestationDescription,
  bindAdditions,
  bindRebinds,
  canonicalJson,
  modifiedMigrations,
  recordsDigest,
  splitLedger,
  splitVerifiedRecords,
  trustedRecordsForScan,
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
    const { additions, rebinds } = splitLedger(
      JSON.parse(fs.readFileSync(trustedFile, 'utf8')),
      JSON.parse(fs.readFileSync(proposedFile, 'utf8'))
    );
    if (!additions.length && !rebinds.length)
      throw new Error('No new or rebound verified finding records.');
    console.log(
      JSON.stringify(
        {
          context: ATTESTATION_CONTEXT,
          count: additions.length,
          description: attestationDescription(additions, rebinds),
          records: additions,
          rebinds,
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
