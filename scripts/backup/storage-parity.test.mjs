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
