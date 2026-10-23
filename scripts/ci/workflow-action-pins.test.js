const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const roots = ['.github/workflows', '.github/actions'];

// Remote refs must be immutable commit SHAs with a trailing version comment so
// Dependabot can keep the pin current. Local `./` actions and reusable
// workflows are versioned with the repository itself.
const pinnedUses =
  /^(?:\.\/\S+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^\s@]+)?@[0-9a-f]{40} # \S.*)$/u;
const usesLine = /^\s*(?:-\s+)?uses:\s*(.*?)\s*$/u;

// Supabase Production authenticates staging deployment markers by the exact Git
// blob of supabase-staging.yaml. Repinning that file changes the blob, so it
// needs a coordinated producer-contract update rather than a mechanical pin.
const blobPinnedProducer = '.github/workflows/supabase-staging.yaml';

function gitBlobSha(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function producerContractPinsCurrentBlob() {
  const bytes = fs.readFileSync(path.join(repoRoot, blobPinnedProducer));
  const production = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/supabase-production.yaml'),
    'utf8'
  );
  const allowlist = /\[workflowPath, \[([^\]]*)\]\]/u.exec(production)?.[1];
  return Boolean(allowlist?.includes(`'${gitBlobSha(bytes)}'`));
}

function yamlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(entry.name) ? [full] : [];
  });
}

function unpinnedUses(source) {
  return source.split('\n').flatMap((line, index) => {
    const match = usesLine.exec(line);
    if (!match) return [];
    const value = match[1].replace(/^(['"])(.*)\1$/u, '$2');
    return pinnedUses.test(value) ? [] : [`${index + 1}: ${value}`];
  });
}

test('workflow and composite action uses are pinned to commit SHAs', () => {
  const files = roots.flatMap((root) => yamlFiles(path.join(repoRoot, root)));
  assert.ok(files.length > 100, 'expected to scan every workflow and action');
  const exempt = producerContractPinsCurrentBlob() ? [blobPinnedProducer] : [];
  const failures = files
    .filter((file) => !exempt.includes(path.relative(repoRoot, file)))
    .flatMap((file) =>
      unpinnedUses(fs.readFileSync(file, 'utf8')).map(
        (entry) => `${path.relative(repoRoot, file)}:${entry}`
      )
    );
  assert.deepEqual(failures, []);
});

test('only the blob-pinned staging producer contract may defer pinning', () => {
  // Once the producer contract no longer pins this exact blob, the exemption
  // lapses and the staging workflow must be pinned like every other workflow.
  assert.equal(producerContractPinsCurrentBlob(), true);
  const staging = fs.readFileSync(
    path.join(repoRoot, blobPinnedProducer),
    'utf8'
  );
  assert.ok(unpinnedUses(staging).length > 0, 'pin staging and drop exemption');
});

test('pin check rejects mutable and uncommented refs', () => {
  const sha = 'a'.repeat(40);
  for (const accepted of [
    `      - uses: actions/checkout@${sha} # v7.0.1`,
    `        uses: actions/cache/restore@${sha} # v6`,
    `    uses: org/repo/.github/workflows/x.yml@${sha} # v2.0.3`,
    '      - uses: ./.github/actions/setup-bun-with-retry',
    '    uses: ./.github/workflows/ci-check.yml',
  ]) {
    assert.deepEqual(unpinnedUses(accepted), [], accepted);
  }
  for (const rejected of [
    '      - uses: actions/checkout@v7',
    '      - uses: dtolnay/rust-toolchain@stable',
    `      - uses: actions/checkout@${sha}`,
    `      - uses: actions/checkout@${sha.slice(0, 12)} # v7`,
    `      - uses: "actions/checkout@v7"`,
    '      - uses: docker://alpine:3',
  ]) {
    assert.equal(unpinnedUses(rejected).length, 1, rejected);
  }
});
