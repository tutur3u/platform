const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  expectedIdentity,
  verifyBuild,
  verifyTests,
} = require('./trusted-public-receipts');

const expected = expectedIdentity({
  SOURCE_SHA: 'a'.repeat(40),
  CONTROL_SHA: 'b'.repeat(40),
  MAIN_SHA: 'c'.repeat(40),
  GITHUB_RUN_ID: '1001',
  GITHUB_RUN_ATTEMPT: '2',
});
const command = () => ({
  qualified: true,
  exit: 0,
  signal: null,
  argv: ['node', '--test'],
  counts: { tests: 3, failed: 0, skipped: 0 },
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-receipts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, receipt) {
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(receipt));
}
function build(root) {
  const bytes = Buffer.from(
    'opaque archive bytes; never executed or extracted'
  );
  fs.writeFileSync(path.join(root, 'public-compiler.tar.gz'), bytes);
  const receipt = {
    ...expected,
    kind: 'public-build',
    app: 'web',
    status: 'PASS',
    commands: [command()],
    archiveBytes: bytes.length,
    archiveSHA256: createHash('sha256').update(bytes).digest('hex'),
  };
  write(root, receipt);
  return receipt;
}
function shards(root) {
  const receipts = [];
  for (const kind of ['unit', 'root', 'types', 'lint']) {
    for (let shard = 0; shard < (kind === 'lint' ? 1 : 4); shard++) {
      const child = path.join(
        root,
        `public-tests-${expected.sourceSHA}-${kind}-${shard}-2`
      );
      fs.mkdirSync(child);
      const receipt = {
        ...expected,
        kind,
        shard,
        status: 'PASS',
        commands: [command()],
      };
      write(child, receipt);
      receipts.push({ child, receipt });
    }
  }
  return receipts;
}

test('build consumer binds opaque archive bytes and exact producer identity', (t) => {
  const root = fixture(t);
  const receipt = build(root);
  assert.deepEqual(verifyBuild(root, expected, 'web'), {
    qualified: true,
    kind: 'public-build',
    app: 'web',
    archiveSHA256: receipt.archiveSHA256,
  });
  const file = path.join(root, 'public-compiler.tar.gz');
  fs.writeFileSync(file, Buffer.alloc(receipt.archiveBytes, 120));
  assert.throws(() => verifyBuild(root, expected, 'web'), {
    code: 'PUBLIC_ARCHIVE_HASH',
  });
});

for (const field of Object.keys(expected)) {
  test(`consumer rejects foreign ${field}`, (t) => {
    const root = fixture(t);
    const receipt = build(root);
    receipt[field] =
      field === 'run' || field === 'attempt' ? '3' : 'e'.repeat(40);
    write(root, receipt);
    assert.throws(() => verifyBuild(root, expected, 'web'), {
      code: 'PUBLIC_RECEIPT_IDENTITY',
    });
  });
}

for (const [label, mutate, code] of [
  [
    'failed producer',
    (r) => {
      r.status = 'FAIL';
    },
    'PUBLIC_RECEIPT_STATUS',
  ],
  [
    'wrong app',
    (r) => {
      r.app = 'meet';
    },
    'PUBLIC_BUILD_IDENTITY',
  ],
  [
    'empty commands',
    (r) => {
      r.commands = [];
    },
    'PUBLIC_RECEIPT_COMMANDS',
  ],
  [
    'unqualified command',
    (r) => {
      r.commands[0].qualified = false;
    },
    'PUBLIC_RECEIPT_COMMAND',
  ],
  [
    'signal',
    (r) => {
      r.commands[0].signal = 'SIGTERM';
    },
    'PUBLIC_RECEIPT_COMMAND',
  ],
  [
    'failed tests',
    (r) => {
      r.commands[0].counts.failed = 1;
    },
    'PUBLIC_RECEIPT_COUNTS',
  ],
  [
    'skipped tests',
    (r) => {
      r.commands[0].counts.skipped = 1;
    },
    'PUBLIC_RECEIPT_COUNTS',
  ],
  [
    'archive cap',
    (r) => {
      r.archiveBytes = 2 ** 31 + 1;
    },
    'PUBLIC_ARCHIVE_SIZE',
  ],
]) {
  test(`consumer rejects ${label}`, (t) => {
    const root = fixture(t);
    const receipt = build(root);
    mutate(receipt);
    write(root, receipt);
    assert.throws(() => verifyBuild(root, expected, 'web'), { code });
  });
}

test('receipt bytes are bounded, JSON only, and regular files', (t) => {
  const root = fixture(t);
  build(root);
  const file = path.join(root, 'receipt.json');
  fs.writeFileSync(file, 'x'.repeat(512 * 1024 + 1));
  assert.throws(() => verifyBuild(root, expected, 'web'), {
    code: 'PUBLIC_RECEIPT_FILE',
  });
  fs.writeFileSync(file, '{invalid');
  assert.throws(() => verifyBuild(root, expected, 'web'), {
    code: 'PUBLIC_RECEIPT_JSON',
  });
  fs.unlinkSync(file);
  fs.symlinkSync('public-compiler.tar.gz', file);
  assert.throws(() => verifyBuild(root, expected, 'web'));
});

test('all thirteen shards must qualify once with executed test counts', (t) => {
  const root = fixture(t);
  const entries = shards(root);
  assert.deepEqual(verifyTests(root, expected), {
    qualified: true,
    kind: 'public-tests',
    receipts: 13,
    tests: 39,
  });
  entries[0].receipt.commands[0].counts = null;
  write(entries[0].child, entries[0].receipt);
  assert.throws(() => verifyTests(root, expected), {
    code: 'PUBLIC_RECEIPT_EMPTY_TESTS',
  });
});

test('shard names cannot substitute a duplicate identity', (t) => {
  const root = fixture(t);
  const entries = shards(root);
  const entry = entries.find(
    (e) => e.receipt.kind === 'unit' && e.receipt.shard === 1
  );
  entry.receipt.shard = 0;
  write(entry.child, entry.receipt);
  assert.throws(() => verifyTests(root, expected), {
    code: 'PUBLIC_RECEIPT_SHARD',
  });
});

test('missing or extra artifact directories fail inventory', (t) => {
  const root = fixture(t);
  const entries = shards(root);
  fs.renameSync(entries[0].child, path.join(root, 'unknown-artifact'));
  assert.throws(() => verifyTests(root, expected), {
    code: 'PUBLIC_RECEIPT_SHARD',
  });
  fs.mkdirSync(path.join(root, 'extra'));
  assert.throws(() => verifyTests(root, expected), {
    code: 'PUBLIC_RECEIPT_INVENTORY',
  });
});
