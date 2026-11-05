// Shared fixture for the definer record admission tests: a git repository
// whose base commit has one migration and an empty trusted ledger, then a head.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ATTESTATION_CONTEXT,
  ATTESTER,
  admitVerifiedFindings,
  attestationDescription,
} = require('./security-definer-admission');
const { checkRepository } = require('./security-definer-guard');

const MIGRATIONS = 'apps/database/supabase/migrations';
const OLD = `${MIGRATIONS}/20260101000000_old.sql`;
const NEW = `${MIGRATIONS}/20260102000000_new.sql`;
// Each file carries one definer that lacks SET search_path: a real finding.
const definer = (name) => `CREATE FUNCTION public.${name}()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN; END; $$;
REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC, anon;
`;

function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

// A base commit with one migration and an empty trusted ledger, then a PR head.
function fixture(t, change = (root) => write(root, NEW, definer('fresh'))) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-admission-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'user.email', 'ci@example.invalid');
  sh(root, 'config', 'user.name', 'ci');
  write(root, OLD, definer('stale'));
  const ledger = path.join(
    root,
    'scripts/ci/security-definer-verified-findings.json'
  );
  write(root, 'scripts/ci/security-definer-verified-findings.json', '[]\n');
  sh(root, 'add', '-A');
  sh(root, 'commit', '-q', '-m', 'base');
  const base = sh(root, 'rev-parse', 'HEAD');
  const trusted = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-trusted-'));
  t.after(() => fs.rmSync(trusted, { recursive: true, force: true }));
  fs.copyFileSync(
    ledger,
    path.join(trusted, 'security-definer-verified-findings.json')
  );
  change(root);
  sh(root, 'add', '-A');
  sh(root, 'commit', '-q', '-m', 'head');
  const head = sh(root, 'rev-parse', 'HEAD');
  return { root, base, head, ledger, trusted };
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

const scanner = (root) => (verifiedFindings) =>
  checkRepository({
    root,
    baseline: [],
    reviewedBlocks: [],
    historicalBlocks: [],
    verifiedFindings,
  });

function recordFor(root, file) {
  const finding = scanner(root)([]).find((entry) => entry.file === file);
  assert.ok(finding, `fixture finding in ${file}`);
  return {
    file,
    line: finding.line,
    sourceDigest: finding.sourceDigest,
    rule: finding.rule,
    signature: finding.signature,
    digest: finding.digest,
    classification: 'verified false positive',
    reason: 'Fixture: reviewed by the security owner.',
  };
}

function status(records, overrides = {}) {
  return {
    context: ATTESTATION_CONTEXT,
    state: 'success',
    description: attestationDescription(records),
    creator: { login: ATTESTER.login, id: ATTESTER.id },
    ...overrides,
  };
}

// Serves statuses per commit SHA, newest first, like the GitHub REST API.
function api(bySha, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const sha = url.match(/commits\/([0-9a-f]{40})\/statuses/)?.[1];
    return { ok: true, status: 200, json: async () => bySha[sha] ?? [] };
  };
}

function admit(f, records, { fetch, env = {} } = {}) {
  fs.writeFileSync(f.ledger, JSON.stringify(records));
  return admitVerifiedFindings({
    root: f.root,
    trustedDirectory: f.trusted,
    scan: scanner(f.root),
    env: {
      BASE_SHA: f.base,
      HEAD_SHA: f.head,
      GITHUB_TOKEN: 'fixture',
      ...env,
    },
    fetch,
  });
}

module.exports = {
  MIGRATIONS,
  NEW,
  OLD,
  admit,
  api,
  definer,
  fixture,
  recordFor,
  status,
  write,
};
