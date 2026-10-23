const assert = require('node:assert/strict');
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
// Block keys may be quoted (`"uses": ...`). Flow mappings (`{ uses: ... }`)
// cannot carry the trailing version comment, so they are always rejected.
const usesLine = /^\s*(?:-\s+)?(['"]?)uses\1\s*:\s*(.*?)\s*$/u;
const flowUses = /[{,]\s*(['"]?)uses\1\s*:/u;
const remoteRef = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/u;

function yamlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(entry.name) ? [full] : [];
  });
}

function scanUses(source) {
  const unpinned = [];
  let remote = 0;
  source.split('\n').forEach((line, index) => {
    const match = usesLine.exec(line);
    if (!match) {
      if (flowUses.test(line)) unpinned.push(`${index + 1}: ${line.trim()}`);
      return;
    }
    const value = match[2].replace(/^(['"])(.*)\1$/u, '$2');
    if (remoteRef.test(value)) remote += 1;
    if (!pinnedUses.test(value)) unpinned.push(`${index + 1}: ${value}`);
  });
  return { remote, unpinned };
}

function unpinnedUses(source) {
  return scanUses(source).unpinned;
}

test('workflow and composite action uses are pinned to commit SHAs', () => {
  const failures = [];
  for (const root of roots) {
    const files = yamlFiles(path.join(repoRoot, root));
    let remote = 0;
    for (const file of files) {
      const scan = scanUses(fs.readFileSync(file, 'utf8'));
      remote += scan.remote;
      for (const entry of scan.unpinned) {
        failures.push(`${path.relative(repoRoot, file)}:${entry}`);
      }
    }
    // Guard against a scan that silently matches nothing.
    assert.ok(remote > 0, `expected remote action references under ${root}`);
  }
  assert.deepEqual(failures, []);
});

test('pin check rejects mutable and uncommented refs', () => {
  const sha = 'a'.repeat(40);
  for (const accepted of [
    `      - uses: actions/checkout@${sha} # v7.0.1`,
    `        uses: actions/cache/restore@${sha} # v6`,
    `    uses: org/repo/.github/workflows/x.yml@${sha} # v2.0.3`,
    '      - uses: ./.github/actions/setup-bun-with-retry',
    '    uses: ./.github/workflows/ci-check.yml',
    `      - "uses": actions/checkout@${sha} # v7.0.1`,
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
    '      - "uses": actions/cache@v6',
    "      - 'uses': actions/cache@v6",
    `      - { uses: actions/checkout@${sha}, with: { fetch-depth: 0 } }`,
    `      - { name: x, "uses": actions/checkout@${sha} }`,
  ]) {
    assert.equal(unpinnedUses(rejected).length, 1, rejected);
  }
});
