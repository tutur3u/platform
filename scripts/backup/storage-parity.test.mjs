import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  compareStorageKeys,
  exportDiskBytes,
  findUnsafeBuckets,
  isUnsafeKey,
  listDownloads,
  parseCsv,
  parseExcludedKeys,
  parseExpectedKeys,
  parseTable,
} from './storage-parity.mjs';

test('parseCsv handles quotes, commas, escaped quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n"multi\nline",z\r\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"'],
    ['multi\nline', 'z'],
  ]);
  assert.deepEqual(parseCsv('a,b\n,\n'), [
    ['a', 'b'],
    ['', ''],
  ]);
  assert.throws(() => parseCsv('a\n"open'), /Unterminated/);
});

test('parseTable checks the header and the field count without echoing rows', () => {
  assert.throws(() => parseTable('x,y\n1,2', ['a', 'b']), /header/);
  assert.throws(
    () => parseTable('a,b\nsecret-value', ['a', 'b']),
    (error) => /row 2/.test(error.message) && !/secret/.test(error.message)
  );
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'storage-parity-'));
  mkdirSync(join(root, 'avatars', 'u1'), { recursive: true });
  mkdirSync(join(root, 'workspaces', 'ws', 'docs'), { recursive: true });
  mkdirSync(join(root, 'empty'), { recursive: true });
  writeFileSync(join(root, 'avatars', 'u1', 'a.webp'), 'abc');
  writeFileSync(join(root, 'workspaces', 'ws', 'docs', 'r, 1.pdf'), 'hello');
  return root;
}

const expectedCsv =
  'bucket,name,size\navatars,u1/a.webp,3\nworkspaces,"ws/docs/r, 1.pdf",5\n';

test('compareStorageKeys passes when every sized key arrives with its size', () => {
  const root = fixture();
  try {
    const report = compareStorageKeys(
      parseExpectedKeys(expectedCsv),
      parseExcludedKeys('bucket,name\n'),
      listDownloads(root, ['avatars', 'workspaces', 'empty', 'missing-dir'])
    );
    assert.equal(report.ok, true);
    assert.equal(report.objects, 2);
    assert.equal(report.bytes, 8);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compareStorageKeys fails on missing, resized or unexpected files', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'avatars', 'stray.bin'), 'x');
    const report = compareStorageKeys(
      parseExpectedKeys(
        `${expectedCsv}changelog,post.png,9\n`.replace(',3\n', ',4\n')
      ),
      parseExcludedKeys('bucket,name\n'),
      listDownloads(root, ['avatars', 'workspaces', 'changelog'])
    );
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ['changelog/post.png']);
    assert.deepEqual(report.sizeMismatch, ['avatars/u1/a.webp']);
    assert.deepEqual(report.unexpected, ['avatars/stray.bin']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the live listing explains keys moved after the snapshot', () => {
  const root = fixture();
  try {
    // Created after the snapshot, and listed live with its size.
    writeFileSync(join(root, 'avatars', 'new.png'), 'four');
    // Overwritten after the snapshot: live size matches the download.
    writeFileSync(join(root, 'avatars', 'u1', 'a.webp'), 'abcdef');
    const snapshot = parseExpectedKeys(`${expectedCsv}avatars,gone.png,2\n`);
    const live = {
      keys: parseExpectedKeys(
        'bucket,name,size\navatars,u1/a.webp,6\navatars,new.png,4\nworkspaces,"ws/docs/r, 1.pdf",5\n'
      ),
      excluded: parseExcludedKeys('bucket,name\n'),
    };
    const report = compareStorageKeys(
      snapshot,
      parseExcludedKeys('bucket,name\n'),
      listDownloads(root, ['avatars', 'workspaces']),
      live
    );
    assert.equal(report.ok, true);
    assert.equal(report.liveChecked, true);
    assert.deepEqual(report.deletedSinceSnapshot, ['avatars/gone.png']);
    assert.deepEqual(report.changedSinceSnapshot, ['avatars/u1/a.webp']);
    assert.deepEqual(report.createdSinceSnapshot, ['avatars/new.png']);
    assert.deepEqual(report.byBucket, {
      avatars: {
        deletedSinceSnapshot: 1,
        changedSinceSnapshot: 1,
        createdSinceSnapshot: 1,
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keys the live listing cannot explain still fail, with counts', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'avatars', 'stray.bin'), 'x');
    const report = compareStorageKeys(
      parseExpectedKeys(
        `${expectedCsv}changelog,post.png,9\n`.replace(',3\n', ',4\n')
      ),
      parseExcludedKeys('bucket,name\n'),
      listDownloads(root, ['avatars', 'workspaces', 'changelog']),
      {
        // Still listed live: a missing backend object, not a delete. The live
        // size disagrees with the download, and the stray file is unknown.
        keys: parseExpectedKeys(
          'bucket,name,size\navatars,u1/a.webp,4\nchangelog,post.png,9\navatars,stray.bin,7\n'
        ),
        excluded: parseExcludedKeys('bucket,name\n'),
      }
    );
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ['changelog/post.png']);
    assert.deepEqual(report.sizeMismatch, ['avatars/u1/a.webp']);
    assert.deepEqual(report.unexpected, ['avatars/stray.bin']);
    assert.equal(report.counts.missing, 1);
    assert.equal(report.counts.sizeMismatch, 1);
    assert.equal(report.counts.unexpected, 1);
    assert.equal(report.counts.deletedSinceSnapshot, 0);
    assert.deepEqual(report.byBucket, {
      changelog: { missing: 1 },
      avatars: { sizeMismatch: 1, unexpected: 1 },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a key listed live without a size is never treated as deleted', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'avatars', 'late.bin'), 'zz');
    const report = compareStorageKeys(
      parseExpectedKeys(
        `${expectedCsv}avatars,pending.png,2\n`.replace(',3\n', ',4\n')
      ),
      parseExcludedKeys('bucket,name\n'),
      listDownloads(root, ['avatars', 'workspaces']),
      {
        keys: parseExpectedKeys('bucket,name,size\n'),
        excluded: parseExcludedKeys(
          'bucket,name\navatars,pending.png\navatars,u1/a.webp\navatars,late.bin\nworkspaces,"ws/docs/r, 1.pdf"\n'
        ),
      }
    );
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ['avatars/pending.png']);
    assert.deepEqual(report.sizeMismatch, ['avatars/u1/a.webp']);
    assert.deepEqual(report.createdSinceSnapshot, ['avatars/late.bin']);
    assert.deepEqual(report.deletedSinceSnapshot, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a bucket id named like an Object property is counted', () => {
  const report = compareStorageKeys(
    parseExpectedKeys('bucket,name,size\nconstructor,a.png,1\n'),
    parseExcludedKeys('bucket,name\n'),
    new Map()
  );
  assert.deepEqual(report.byBucket, { constructor: { missing: 1 } });
  assert.equal(report.liveChecked, false);
});

test('an excluded key that was downloaded does not fail parity', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'avatars', 'pending.bin'), 'partial');
    const report = compareStorageKeys(
      parseExpectedKeys(expectedCsv),
      parseExcludedKeys('bucket,name\navatars,pending.bin\n'),
      listDownloads(root, ['avatars', 'workspaces'])
    );
    assert.equal(report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('expected keys reject malformed buckets and sizes', () => {
  assert.throws(
    () => parseExpectedKeys('bucket,name,size\n..,a,1\n'),
    /Malformed/
  );
  assert.throws(
    () => parseExpectedKeys('bucket,name,size\navatars,a,2.1e+09\n'),
    /Malformed/
  );
});

test('exportDiskBytes covers dump, restore, storage tree and archive', () => {
  const gib = 1024 ** 3;
  assert.equal(exportDiskBytes(6 * gib, 2 * gib), 18 * gib);
});

test('keys that cannot map inside the bucket directory are unsafe', () => {
  for (const name of [
    '../x',
    'a/../../b',
    '/abs',
    'a//b',
    'folder//',
    './a',
    'a/.',
    '',
    'x'.repeat(256),
  ]) {
    assert.equal(isUnsafeKey(name), true, name);
  }
  for (const name of [
    'a',
    'ws/docs/r, 1.pdf',
    '.hidden',
    'a..b/c',
    'folder/',
    'x'.repeat(255),
  ]) {
    assert.equal(isUnsafeKey(name), false, name);
  }
});

test('a bucket with an unsafe key is flagged and fails parity', () => {
  const expected = parseExpectedKeys(
    'bucket,name,size\nworkspaces,"../../etc/x",1\navatars,u1/a.webp,3\n'
  );
  const excluded = parseExcludedKeys('bucket,name\nchangelog,a/../b\n');
  assert.deepEqual([...findUnsafeBuckets(expected, excluded)].sort(), [
    'changelog',
    'workspaces',
  ]);
  const report = compareStorageKeys(expected, excluded, new Map());
  assert.equal(report.ok, false);
  assert.deepEqual(report.unsafe, [
    'changelog/a/../b',
    'workspaces/../../etc/x',
  ]);
});
