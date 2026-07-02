const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_MAX_AGE_DAYS,
  formatBytes,
  getRustCacheReport,
  parseBytes,
  pruneRustCache,
  runAutoRustCacheCleanup,
  selectPruneCandidates,
  shouldSkipAutoCleanup,
} = require('./rust-cache.js');

function makeTempTarget() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-cache-'));
  const target = path.join(root, 'target');
  fs.mkdirSync(target, { recursive: true });
  return { root, target };
}

function writeFile(filePath, sizeBytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(sizeBytes, 1));
}

function touch(filePath, mtimeMs) {
  const date = new Date(mtimeMs);
  fs.utimesSync(filePath, date, date);
}

test('parseBytes accepts binary cache size units', () => {
  assert.equal(parseBytes('20g'), 20 * 1024 ** 3);
  assert.equal(parseBytes('1.5GiB'), Math.floor(1.5 * 1024 ** 3));
  assert.equal(formatBytes(1536), '1.5KiB');
});

test('report summarizes immediate target cache entries', () => {
  const { root, target } = makeTempTarget();

  try {
    writeFile(path.join(target, 'debug', 'deps', 'a.o'), 12);
    writeFile(path.join(target, 'release', 'backend'), 34);

    const report = getRustCacheReport({ targetPath: target });

    assert.equal(report.totalSizeBytes, 46);
    assert.deepEqual(
      report.entries.map((entry) => entry.name),
      ['debug', 'release']
    );
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test('selectPruneCandidates prefers stale directories before size pressure', () => {
  const now = Date.UTC(2026, 6, 1);
  const staleMtime = now - (DEFAULT_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000;
  const freshMtime = now - 60_000;
  const report = {
    entries: [
      {
        isDirectory: true,
        mtimeMs: staleMtime,
        name: 'debug',
        path: '/target/debug',
        sizeBytes: 10,
      },
      {
        isDirectory: true,
        mtimeMs: freshMtime,
        name: 'release',
        path: '/target/release',
        sizeBytes: 90,
      },
    ],
    totalSizeBytes: 100,
  };

  assert.deepEqual(
    selectPruneCandidates({
      maxAgeDays: DEFAULT_MAX_AGE_DAYS,
      maxSizeBytes: 80,
      now,
      report,
    }).map((entry) => [entry.name, entry.reason]),
    [
      ['debug', 'stale'],
      ['release', 'size-cap'],
    ]
  );
});

test('pruneRustCache removes candidates only when apply is true', () => {
  const { root, target } = makeTempTarget();
  const now = Date.UTC(2026, 6, 1);
  const staleMtime = now - 15 * 24 * 60 * 60 * 1000;
  const staleDir = path.join(target, 'debug');

  try {
    writeFile(path.join(staleDir, 'deps', 'a.o'), 12);
    touch(staleDir, staleMtime);

    const dryRun = pruneRustCache({
      apply: false,
      maxAgeDays: 14,
      now,
      targetPath: target,
    });

    assert.equal(dryRun.candidates.length, 1);
    assert.equal(fs.existsSync(staleDir), true);

    const applied = pruneRustCache({
      apply: true,
      maxAgeDays: 14,
      now,
      targetPath: target,
    });

    assert.equal(applied.removed.length, 1);
    assert.equal(fs.existsSync(staleDir), false);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test('auto cleanup skips CI and respects the once-per-interval state file', () => {
  const { root, target } = makeTempTarget();
  const stateFile = path.join(root, 'state.json');
  const now = Date.UTC(2026, 6, 1);

  try {
    assert.deepEqual(
      shouldSkipAutoCleanup({
        env: { CI: '1' },
        now,
        stateFile,
      }),
      { reason: 'ci', skip: true }
    );

    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ lastRunAt: new Date(now - 60_000).toISOString() })
    );

    assert.deepEqual(
      shouldSkipAutoCleanup({
        env: {},
        now,
        stateFile,
      }),
      { reason: 'recent', skip: true }
    );

    const result = runAutoRustCacheCleanup({
      env: {},
      force: true,
      now,
      stateFile,
      targetPath: target,
    });

    assert.equal(result.skipped, false);
    assert.equal(
      JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastRunAt,
      new Date(now).toISOString()
    );
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
